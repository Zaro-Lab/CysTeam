import os
import sys
import tempfile
import traceback
import io
import json

from datetime import datetime, timedelta

from firebase_admin import initialize_app, firestore, storage, credentials
from firebase_functions import https_fn, options
from google.cloud import storage as cloud_storage
import pandas as pd

from csea500b import run_csea_analysis

initialize_app()

def merge_background_files(bucket, background_paths, temp_dir):
    all_backgrounds = []
    for bg_path in background_paths:
        if bg_path.startswith("gs://"):
            bg_path = "/".join(bg_path.split("/")[3:])
        local_path = os.path.join(temp_dir, f"bg_{os.path.basename(bg_path)}")
        download_blob(bucket, bg_path, local_path)
        df = pd.read_csv(local_path)
        all_backgrounds.append(df)

    merged_df = pd.concat(all_backgrounds, ignore_index=True)
    merged_path = os.path.join(temp_dir, "merged_background.csv")
    merged_df.to_csv(merged_path, index=False)
    return merged_path

def download_blob(bucket: cloud_storage.Bucket, source_blob_path: str, destination_file_path: str):
    blob = bucket.blob(source_blob_path)
    blob.download_to_filename(destination_file_path)
    return destination_file_path

def upload_results(bucket: cloud_storage.Bucket, local_file_path: str, destination_blob_path: str) -> str:
    blob = bucket.blob(destination_blob_path)
    blob.upload_from_filename(local_file_path)
    blob.make_public()
    return f"https://storage.googleapis.com/{bucket.name}/{destination_blob_path}"

def update_job_status(
    job_ref: firestore.DocumentReference,
    status: str,
    step: str,
    error: str = None,
    output_files: list = None,
    logs: list = None
):
    update_data = {
        "status": status,
        "step": step,
        "lastUpdated": firestore.SERVER_TIMESTAMP,
    }
    if error:
        update_data["error"] = error
    if output_files is not None:
        update_data["outputFiles"] = output_files
    if logs is not None and len(logs) > 0:
        update_data["logs"] = firestore.ArrayUnion(logs)

    job_ref.update(update_data)

@https_fn.on_request(
    cors=options.CorsOptions(
        cors_origins=["*"],
        cors_methods=["GET", "POST", "OPTIONS"]
    ),
    memory=options.MemoryOption.GB_32,
    timeout_sec=3600,
    cpu=8,
    min_instances=0,
    max_instances=10
)
def run_analysis(req: https_fn.Request) -> https_fn.Response:
    if req.method == "OPTIONS":
        return https_fn.Response(
            status=204,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization"
            }
        )
    
    if req.method == "POST" and req.headers.get("content-type") != "application/json":
        return https_fn.Response(
            response={"error": "Content-Type must be application/json"},
            status=415,
            headers={"Content-Type": "application/json"}
        )
    
    try:
        try:
            request_json = req.get_json() if req.method == "POST" else {}
        except ValueError:
            return https_fn.Response(
                response={"error": "Invalid JSON payload"},
                status=400,
                headers={"Content-Type": "application/json"}
            )

        required_fields = ["jobId", "foregroundFilePath", "backgroundSelections"]
        missing_fields = [field for field in required_fields if field not in request_json]
        
        if missing_fields:
            return https_fn.Response(
                response={"error": f"Missing required fields: {', '.join(missing_fields)}"},
                status=400,
                headers={"Content-Type": "application/json"}
            )

        job_id = request_json["jobId"]
        foreground_file_path = request_json["foregroundFilePath"]
        background_selections = request_json["backgroundSelections"]
        annotation_sel = request_json.get("annotationSelection", "molecular")

        db = firestore.client()
        storage_client = cloud_storage.Client()
        bucket = storage_client.bucket("zaro-lab.firebasestorage.app")
        job_ref = db.collection("analysisJobs").document(job_id)

        update_job_status(job_ref, "INITIALIZING", "Starting analysis")

        with tempfile.TemporaryDirectory() as temp_dir:
            try:
                update_job_status(job_ref, "RUNNING", "Downloading input files")

                local_foreground_path = os.path.join(temp_dir, f"{job_id}_foreground.csv")
                download_blob(bucket, foreground_file_path, local_foreground_path)

                local_background_path = merge_background_files(bucket, background_selections, temp_dir)

                if annotation_sel == "molecular":
                    anno_csv = "df_annotation_sub_molecular_features.csv"
                    bgcys_csv = "bgcys_anno_molecular_features.csv"
                elif annotation_sel == "experimental":
                    anno_csv = "df_annotation_sub_experimental_data.csv"
                    bgcys_csv = "bgcys_anno_experimental_data.csv"
                elif annotation_sel == "structural":
                    anno_csv = "df_annotation_sub_structural.csv"
                    bgcys_csv = "bgcys_anno_structural.csv"
                else:
                    anno_csv = "df_annotation_sub_molecular_features.csv"
                    bgcys_csv = "bgcys_anno_molecular_features.csv"

                local_anno_path = os.path.join(temp_dir, "annotation.csv")
                local_anno_bgcys_path = os.path.join(temp_dir, "anno_bgcys.csv")

                download_blob(bucket, f"reference/{anno_csv}", local_anno_path)
                download_blob(bucket, f"reference/{bgcys_csv}", local_anno_bgcys_path)

                output_dir = os.path.join(temp_dir, f"results_{job_id}")
                os.makedirs(output_dir, exist_ok=True)

                update_job_status(job_ref, "RUNNING", "Running CSEA analysis")

                buffer = io.StringIO()
                old_stdout = sys.stdout
                sys.stdout = buffer

                try:
                    ret = run_csea_analysis(
                        fp_cys=local_foreground_path,
                        fp_bg=local_background_path,
                        fp_anno=local_anno_path,
                        fp_anno_bgcys=local_anno_bgcys_path,
                        output_dir=output_dir,
                        n_perm=500,
                    )
                finally:
                    sys.stdout = old_stdout
                    full_output = buffer.getvalue()
                    log_lines = full_output.splitlines()
                    update_job_status(job_ref, "RUNNING", "Analysis logs", logs=log_lines)

                output_urls = []
                for filename in os.listdir(output_dir):
                    if filename.endswith(".csv") or filename.endswith(".png"):
                        local_path = os.path.join(output_dir, filename)
                        remote_path = f"results/{job_id}/{filename}"
                        signed_url = upload_results(bucket, local_path, remote_path)
                        output_urls.append({"filename": filename, "url": signed_url})

                update_job_status(
                    job_ref,
                    "COMPLETED",
                    "Analysis complete",
                    output_files=output_urls,
                )

                print(ret)

                return https_fn.Response(
                    json.dumps({"message": "Analysis completed", 
                                "outputFiles": output_urls, 
                                "stats": {k:v for k,v in ret.items() if k != 'fp_plot'},
                                "figures": {'barplot': ret['fp_plot']}
                                }),
                    status=200,
                    headers={"Content-Type": "application/json"},
                )

            except Exception as e:
                error_message = f"Error in analysis processing: {str(e)}\n{traceback.format_exc()}"
                print(error_message)
                update_job_status(job_ref, "ERROR", "Analysis failed", error=error_message)
                return https_fn.Response(
                    response={"error": error_message},
                    status=500,
                    headers={"Content-Type": "application/json"}
                )

    except Exception as e:
        error_message = f"Error in request handling: {str(e)}\n{traceback.format_exc()}"
        print(error_message)
        return https_fn.Response(
            response={"error": error_message},
            status=500,
            headers={"Content-Type": "application/json"}
        )

@https_fn.on_request(
    cors=options.CorsOptions(
        cors_origins=["*"],
        cors_methods=["GET", "POST", "OPTIONS"]
    ),
    memory=options.MemoryOption.GB_1,
    timeout_sec=60
)
def preview_csv(req: https_fn.Request) -> https_fn.Response:
    if req.method == "OPTIONS":
        return https_fn.Response(
            status=204,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization"
            }
        )
    
    try:
        if req.method == "GET":
            job_id = req.args.get("jobId")
            filename = req.args.get("filename")
        elif req.method == "POST":
            try:
                request_json = req.get_json()
                job_id = request_json.get("jobId")
                filename = request_json.get("filename")
            except ValueError:
                return https_fn.Response(
                    response={"error": "Invalid JSON payload"},
                    status=400,
                    headers={"Content-Type": "application/json"}
                )
        else:
            return https_fn.Response(
                response={"error": "Method not allowed"},
                status=405,
                headers={"Content-Type": "application/json"}
            )
        
        if not job_id or not filename:
            return https_fn.Response(
                response={"error": "Missing required parameters: jobId and filename"},
                status=400,
                headers={"Content-Type": "application/json"}
            )

        storage_client = cloud_storage.Client()
        bucket = storage_client.bucket("zaro-lab.firebasestorage.app")
        
        if (filename.startswith("output_") or 
            filename.startswith("result_") or 
            filename in ["enrichment.csv", "binned.csv"]):
            file_path = f"results/{job_id}/{filename}"
        else:
            file_path = f"uploads/{job_id}/{filename}"
        
        with tempfile.NamedTemporaryFile(suffix='.csv') as temp_file:
            try:
                download_blob(bucket, file_path, temp_file.name)
                
                df = pd.read_csv(temp_file.name, nrows=20)
                
                preview_data = {
                    "headers": df.columns.tolist(),
                    "rows": df.values.tolist(),
                    "rowCount": len(df),
                    "totalRows": pd.read_csv(temp_file.name, skiprows=lambda x: x > 0, nrows=1).shape[0] if df.shape[0] > 0 else 0
                }
                
                return https_fn.Response(
                    json.dumps(preview_data),
                    status=200,
                    headers={"Content-Type": "application/json"}
                )
                
            except Exception as e:
                error_message = f"Error retrieving or processing CSV file: {str(e)}"
                print(error_message)
                print(traceback.format_exc())
                return https_fn.Response(
                    response={"error": error_message},
                    status=500,
                    headers={"Content-Type": "application/json"}
                )
    
    except Exception as e:
        error_message = f"Error in request handling: {str(e)}"
        print(error_message)
        print(traceback.format_exc())
        return https_fn.Response(
            response={"error": error_message},
            status=500,
            headers={"Content-Type": "application/json"}
        )