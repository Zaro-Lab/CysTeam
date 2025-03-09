import {
  Category,
  CheckCircle,
  ContentPaste,
  Download,
  ExpandLess,
  ExpandMore,
  FileOpen,
  Image,
  PlayArrow,
  PlayCircle,
  RestartAlt,
  Science,
  TableView,
  Upload,
  Visibility,
} from "@mui/icons-material";

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  createTheme,
  FormControlLabel,
  Grid,
  IconButton,
  Paper,
  Radio,
  RadioGroup,
  Step,
  StepLabel,
  Stepper,
  Tab,
  Tabs,
  TextField,
  ThemeProvider,
  Typography,
} from "@mui/material";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import React, { useEffect, useState } from "react";
import AcknowledgementsBox from "./components/Acknowledgements";
import { db, storage } from "./firebase";

const theme = createTheme({
  palette: {
    primary: {
      main: "#2563eb",
      light: "#60a5fa",
      dark: "#1d4ed8",
    },
    secondary: {
      main: "#7c3aed",
      light: "#a78bfa",
      dark: "#5b21b6",
    },
    background: {
      default: "#f8fafc",
      paper: "#ffffff",
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: "none",
          fontWeight: 600,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow:
            "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        },
      },
    },
  },
});

interface BackgroundOption {
  label: string;
  value: string;
}

interface OutputFile {
  filename: string;
  url: string;
}

interface CsvPreviewData {
  fileName: string;
  headers: string[];
  rows: string[][];
  isLoading: boolean;
  error: string | null;
}

const CLOUD_FUNCTION_BASE_URL =
  process.env.REACT_APP_CLOUD_FUNCTION_URL ||
  "https://us-central1-zaro-lab.cloudfunctions.net";

const STEPS = [
  "Upload Data",
  "Select Backgrounds",
  "Choose Annotation",
  "Analysis",
];

function App() {
  const [activeStep, setActiveStep] = useState(0);
  const [foregroundFile, setForegroundFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputMethod, setInputMethod] = useState<"csv" | "text">("text");
  const [cysteineText, setCysteineText] = useState<string>("");
  const [cysteineData, setCysteineData] = useState<string[]>([]);
  const [analysisStats, setAnalysisStats] = useState(null);

  const backgroundOptions: BackgroundOption[] = [
    {
      label: "Colon Cancer",
      value:
        "gs://zaro-lab.firebasestorage.app/aggregated_tissue_cysteines/Updated_Colon_Cancer_Cysteine_Master_List.csv",
    },
    {
      label: "Melanoma Cancer",
      value:
        "gs://zaro-lab.firebasestorage.app/aggregated_tissue_cysteines/Updated_Melanoma_Cancer_Cysteine_Master_List.csv",
    },
    {
      label: "Leukemia Cancer",
      value:
        "gs://zaro-lab.firebasestorage.app/aggregated_tissue_cysteines/Updated_Leukemia_Cancer_Cysteine_Master_List.csv",
    },
    {
      label: "NSCL Cancer",
      value:
        "gs://zaro-lab.firebasestorage.app/aggregated_tissue_cysteines/Updated_NSCL_Cancer_Cysteine_Master_List.csv",
    },
    {
      label: "CNS Cancer",
      value:
        "gs://zaro-lab.firebasestorage.app/aggregated_tissue_cysteines/Updated_CNS_Cancer_Cysteine_Master_List.csv",
    },
    {
      label: "Ovarian Cancer",
      value:
        "gs://zaro-lab.firebasestorage.app/aggregated_tissue_cysteines/Updated_Ovarian_Cancer_Cysteine_Master_List.csv",
    },
    {
      label: "Prostate Cancer",
      value:
        "gs://zaro-lab.firebasestorage.app/aggregated_tissue_cysteines/Updated_Prostate_Cancer_Cysteine_Master_List.csv",
    },
    {
      label: "Breast Cancer",
      value:
        "gs://zaro-lab.firebasestorage.app/aggregated_tissue_cysteines/Updated_Breast_Cancer_Cysteine_Master_List.csv",
    },
    {
      label: "Renal Cancer",
      value:
        "gs://zaro-lab.firebasestorage.app/aggregated_tissue_cysteines/Updated_Renal_Cancer_Cysteine_Master_List.csv",
    },
  ];

  const [backgroundSelections, setBackgroundSelections] = useState<string[]>(
    []
  );
  const [annotationType, setAnnotationType] = useState<string>("molecular");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("");
  const [jobStep, setJobStep] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [outputFiles, setOutputFiles] = useState<OutputFile[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedFilePreview, setSelectedFilePreview] = useState<string | null>(
    null
  );
  const [csvPreviews, setCsvPreviews] = useState<
    Record<string, CsvPreviewData>
  >({});

  useEffect(() => {
    if (!jobId) return;

    const unsub = onSnapshot(doc(db, "analysisJobs", jobId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setJobStatus(data.status ?? "");
        setJobStep(data.step ?? "");

        const newOutputFiles = data.outputFiles ?? [];
        setOutputFiles(newOutputFiles);

        if (
          data.status === "COMPLETED" &&
          newOutputFiles.length > 0 &&
          !selectedFilePreview
        ) {
          const pngFile = newOutputFiles.find((file: OutputFile) =>
            file.filename.endsWith(".png")
          );
          if (pngFile) {
            fetchAndPreviewCsv(pngFile.filename);
          } else if (newOutputFiles.length > 0) {
            fetchAndPreviewCsv(newOutputFiles[0].filename);
          }
        }

        setAnalysisStats(data.stats ?? null);
        if (Array.isArray(data.logs)) {
          setLogs(data.logs);
        }
        if (typeof data.progress === "number") {
          setProgress(data.progress);
        }
      }
    });

    return () => unsub();
  }, [jobId, selectedFilePreview]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "text/csv") {
        setForegroundFile(file);
      } else {
        setError("Please upload a CSV file");
      }
    }
  };

  const handleForegroundChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.type === "text/csv") {
        setForegroundFile(file);
        setError(null);
      } else {
        setError("Please upload a CSV file");
      }
    }
  };

  const handleToggleBackground = (value: string) => {
    setBackgroundSelections((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value]
    );
  };

  const selectAll = () => {
    setBackgroundSelections(backgroundOptions.map((opt) => opt.value));
  };

  const unselectAll = () => {
    setBackgroundSelections([]);
  };

  const startAnalysis = async () => {
    if (inputMethod === "csv" && !foregroundFile) {
      setError("Please select a foreground CSV file first.");
      return;
    }

    if (inputMethod === "text" && cysteineData.length === 0) {
      setError("Please enter cysteine data first.");
      return;
    }

    if (backgroundSelections.length === 0) {
      setError("Please select at least one background.");
      return;
    }

    setError(null);

    try {
      const jobRef = doc(collection(db, "analysisJobs"));
      const newJobId = jobRef.id;
      setJobId(newJobId);

      await setDoc(jobRef, {
        status: "QUEUED",
        step: "Uploading foreground data",
        createdAt: serverTimestamp(),
        backgroundSelections,
        outputFiles: [],
        logs: [],
      });

      let storagePath = "";
      let uploadTask: any;

      if (inputMethod === "csv" && foregroundFile) {
        storagePath = `uploads/${newJobId}/${foregroundFile.name}`;
        const storageRef = ref(storage, storagePath);
        uploadTask = uploadBytesResumable(storageRef, foregroundFile);
      } else {
        const csvContent = cysteineData.join("\n");
        const blob = new Blob([csvContent], { type: "text/csv" });
        const fileName = `cysteines_${new Date().getTime()}.csv`;
        storagePath = `uploads/${newJobId}/${fileName}`;
        const storageRef = ref(storage, storagePath);
        uploadTask = uploadBytesResumable(storageRef, blob);
      }

      uploadTask.on(
        "state_changed",
        (snapshot: any) => {
          const percent =
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setProgress(Math.round(percent));
        },
        async (error: any) => {
          console.error("Upload error:", error);
          setError("Upload failed. Please try again.");
          if (newJobId) {
            await updateDoc(doc(db, "analysisJobs", newJobId), {
              status: "ERROR",
              step: "Upload failed",
              error: error.message,
            });
          }
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

            await updateDoc(jobRef, {
              status: "UPLOADED",
              step: "Invoking Cloud Function",
            });

            const payload = {
              jobId: newJobId,
              foregroundFilePath: storagePath,
              backgroundSelections,
              annotationSelection: annotationType,
            };

            const response = await fetch(
              `${CLOUD_FUNCTION_BASE_URL}/run_analysis`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                  "Access-Control-Allow-Origin": "*",
                },
                credentials: "omit",
                body: JSON.stringify(payload),
              }
            );

            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log("Analysis started successfully:", data);

            if (data.stats) {
              await updateDoc(jobRef, {
                stats: data.stats,
              });
            }
          } catch (error: any) {
            setError(error.message);
            await updateDoc(jobRef, {
              status: "ERROR",
              step: "Failed to process upload",
              error: error.message,
            });
          }
        }
      );
    } catch (error: any) {
      setError(error.message);
      if (jobId) {
        await updateDoc(doc(db, "analysisJobs", jobId), {
          status: "ERROR",
          step: "Failed to start analysis",
          error: error.message,
        });
      }
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setCysteineText(text);

      const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
      setCysteineData(lines);
    } catch (err) {
      setError(
        "Unable to access clipboard. Please paste manually or check browser permissions."
      );
    }
  };

  const handleCysteineTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setCysteineText(text);

    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
    setCysteineData(lines);
  };

  const fetchAndPreviewCsv = async (fileName: string) => {
    setSelectedFilePreview(fileName);

    if (fileName.endsWith(".png")) {
      return;
    }

    if (csvPreviews[fileName] && !csvPreviews[fileName].isLoading) {
      return;
    }

    setCsvPreviews((prev) => ({
      ...prev,
      [fileName]: {
        fileName,
        headers: [],
        rows: [],
        isLoading: true,
        error: null,
      },
    }));

    try {
      const response = await fetch(
        `${CLOUD_FUNCTION_BASE_URL}/preview_csv?jobId=${jobId}&filename=${fileName}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          credentials: "omit",
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseText = await response.text();
      let previewData;

      try {
        previewData = JSON.parse(responseText);
      } catch (parseError: any) {
        console.error("JSON parse error:", parseError);

        const sanitizedText = responseText
          .replace(/\bNaN\b/g, '"NaN"')
          .replace(/\bInfinity\b/g, '"Infinity"')
          .replace(/\bundefined\b/g, '"undefined"');

        try {
          previewData = JSON.parse(sanitizedText);
        } catch (secondParseError) {
          throw new Error(`Invalid response format: ${parseError.message}`);
        }
      }

      if (!previewData || typeof previewData !== "object") {
        throw new Error("Response is not in the expected format");
      }

      const headers = Array.isArray(previewData.headers)
        ? previewData.headers
        : [];
      const rows = Array.isArray(previewData.rows) ? previewData.rows : [];

      const sanitizedRows = rows.map((row: any) => {
        if (!Array.isArray(row)) return [];
        return row.map((cell) => {
          if (cell === null || cell === undefined) return "";
          if (typeof cell === "number" && isNaN(cell)) return "NaN";
          return String(cell);
        });
      });

      setCsvPreviews((prev) => ({
        ...prev,
        [fileName]: {
          fileName,
          headers: headers.map((h: any) => String(h)),
          rows: sanitizedRows,
          isLoading: false,
          error: null,
        },
      }));
    } catch (error: any) {
      console.error("CSV fetch error:", error);
      setCsvPreviews((prev) => ({
        ...prev,
        [fileName]: {
          ...prev[fileName],
          isLoading: false,
          error: `Failed to access file: ${error.message}`,
        },
      }));

      setTimeout(() => {
        const mockData = generateMockCsvData(fileName);

        setCsvPreviews((prev) => ({
          ...prev,
          [fileName]: {
            fileName,
            headers: mockData.headers,
            rows: mockData.rows,
            isLoading: false,
            error: `${
              prev[fileName]?.error || "Data error"
            } (showing placeholder data)`,
          },
        }));
      }, 500);
    }
  };

  const generateMockCsvData = (fileName: string) => {
    let headers: string[] = [];
    let rows: string[][] = [];

    if (fileName.includes("enriched") || fileName.includes("Enriched")) {
      headers = ["Cysteine", "P-value", "Fold Change", "Function", "Pathway"];
      rows = Array(20)
        .fill(0)
        .map((_, i) => [
          `P${10000 + i}_C${Math.floor(Math.random() * 999)}`,
          (Math.random() * 0.05).toFixed(4),
          (1 + Math.random() * 4).toFixed(2),
          ["Oxidoreductase", "Transferase", "Kinase", "Transporter"][
            Math.floor(Math.random() * 4)
          ],
          [
            "Glycolysis",
            "TCA cycle",
            "Lipid metabolism",
            "Signal transduction",
          ][Math.floor(Math.random() * 4)],
        ]);
    } else if (fileName.includes("summary") || fileName.includes("Summary")) {
      headers = ["Category", "Count", "Percentage", "Statistics"];
      rows = [
        ["Molecular Function", "125", "42.3%", "p<0.001"],
        ["Biological Process", "87", "29.5%", "p<0.01"],
        ["Cellular Component", "53", "18.0%", "p<0.05"],
        ["Pathways", "30", "10.2%", "p<0.05"],
      ];
    } else {
      headers = ["Cysteine", "Score", "Description"];
      rows = Array(20)
        .fill(0)
        .map((_, i) => [
          `P${10000 + i}_C${Math.floor(Math.random() * 999)}`,
          (Math.random() * 10).toFixed(2),
          `Protein ${i + 1} - ${
            ["Cancer", "Normal", "Disease", "Control"][
              Math.floor(Math.random() * 4)
            ]
          } sample`,
        ]);
    }

    return { headers, rows };
  };

  const renderCsvTable = (previewData: CsvPreviewData) => {
    if (previewData.isLoading) {
      return (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress size={40} />
        </Box>
      );
    }

    if (previewData.error) {
      return (
        <Alert severity="error" sx={{ mb: 2 }}>
          {previewData.error}
        </Alert>
      );
    }

    if (!previewData.headers.length || !previewData.rows.length) {
      return (
        <Alert severity="info" sx={{ mb: 2 }}>
          No data available for preview.
        </Alert>
      );
    }

    return (
      <>
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          mb={1}
        >
          Showing first {previewData.rows.length} rows of data (preview)
        </Typography>

        <Box
          sx={{
            overflowX: "auto",
            "&::-webkit-scrollbar": {
              height: "8px",
            },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: "#bbbbbb",
              borderRadius: "4px",
            },
          }}
        >
          <Box
            component="table"
            sx={{
              borderCollapse: "collapse",
              width: "100%",
              fontFamily: "monospace",
              fontSize: "0.85rem",
            }}
          >
            <Box component="thead">
              <Box component="tr">
                {previewData.headers.map((header, idx) => (
                  <Box
                    component="th"
                    key={idx}
                    sx={{
                      textAlign: "left",
                      padding: "8px 16px",
                      backgroundColor: "primary.light",
                      color: "white",
                      position: "sticky",
                      top: 0,
                      whiteSpace: "nowrap",
                      maxWidth: "300px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={header || `Column ${idx + 1}`}
                  >
                    {header || `Column ${idx + 1}`}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box component="tbody">
              {previewData.rows.map((row, rowIdx) => (
                <Box
                  component="tr"
                  key={rowIdx}
                  sx={{
                    "&:nth-of-type(odd)": {
                      backgroundColor: "rgba(0, 0, 0, 0.02)",
                    },
                    "&:hover": {
                      backgroundColor: "rgba(0, 0, 0, 0.05)",
                    },
                  }}
                >
                  {row.map((cell, cellIdx) => {
                    const isSpecialValue =
                      cell === "NaN" ||
                      cell === "undefined" ||
                      cell === "null" ||
                      cell === "Infinity" ||
                      cell === "";

                    return (
                      <Box
                        component="td"
                        key={cellIdx}
                        sx={{
                          padding: "6px 16px",
                          borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
                          whiteSpace: "nowrap",
                          maxWidth: "300px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: isSpecialValue ? "text.disabled" : "inherit",
                          fontStyle: isSpecialValue ? "italic" : "normal",
                        }}
                        title={cell}
                      >
                        {isSpecialValue ? cell || "empty" : cell}
                      </Box>
                    );
                  })}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </>
    );
  };

  const resetAnalysis = () => {
    setActiveStep(0);
    setForegroundFile(null);
    setDragActive(false);
    setExpandedLogs(true);
    setError(null);
    setBackgroundSelections([]);
    setAnnotationType("molecular");
    setJobId(null);
    setJobStatus("");
    setJobStep("");
    setProgress(0);
    setOutputFiles([]);
    setLogs([]);
    setInputMethod("csv");
    setCysteineText("");
    setCysteineData([]);
    setSelectedFilePreview(null);
    setCsvPreviews({});
  };

  const getStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box sx={{ width: "100%" }}>
            <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
              <Tabs
                value={inputMethod}
                onChange={(_, value) => setInputMethod(value)}
                aria-label="input method tabs"
                centered
              >
                <Tab label="Text Entry" value="text" />

                <Tab label="Upload CSV" value="csv" />
              </Tabs>
            </Box>

            {inputMethod === "csv" ? (
              <Box
                sx={{
                  p: 3,
                  border: "2px dashed",
                  borderColor: dragActive ? "primary.main" : "grey.300",
                  borderRadius: 2,
                  textAlign: "center",
                  bgcolor: dragActive ? "primary.50" : "background.paper",
                  transition: "all 0.2s ease-in-out",
                }}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleForegroundChange}
                  style={{ display: "none" }}
                  id="csv-upload"
                />
                <label htmlFor="csv-upload">
                  <Button
                    component="span"
                    variant="contained"
                    startIcon={<Upload />}
                    sx={{ mb: 2 }}
                  >
                    Choose CSV File
                  </Button>
                </label>
                <Typography variant="body1" color="text.secondary">
                  or drag and drop your CSV file here
                </Typography>
                {foregroundFile && (
                  <Chip
                    label={foregroundFile.name}
                    onDelete={() => setForegroundFile(null)}
                    color="primary"
                    sx={{ mt: 2 }}
                  />
                )}
              </Box>
            ) : (
              <Box sx={{ width: "100%" }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    mb: 2,
                  }}
                >
                  <Typography variant="h6">Enter Cysteine Data</Typography>
                  <Button
                    variant="outlined"
                    startIcon={<ContentPaste />}
                    onClick={handlePasteFromClipboard}
                  >
                    Paste from Clipboard
                  </Button>
                </Box>

                <TextField
                  fullWidth
                  multiline
                  placeholder="Enter one cysteine per line (e.g., P12345_C123)"
                  value={cysteineText}
                  onChange={handleCysteineTextChange}
                  variant="outlined"
                  rows={15}
                  InputProps={{
                    sx: {
                      fontFamily: "monospace",
                      fontSize: "0.9rem",
                      whiteSpace: "nowrap",
                      overflow: "auto",
                      "&:hover": {
                        "&::-webkit-scrollbar": {
                          display: "block",
                        },
                      },
                      "&::-webkit-scrollbar": {
                        width: "8px",
                        height: "8px",
                        backgroundColor: "#f5f5f5",
                      },
                      "&::-webkit-scrollbar-thumb": {
                        backgroundColor: "#888",
                        borderRadius: "4px",
                      },
                    },
                  }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      "& fieldset": {
                        borderColor: "grey.300",
                      },
                      "&:hover fieldset": {
                        borderColor: "primary.light",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "primary.main",
                      },
                    },
                  }}
                />

                {cysteineData.length > 0 && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 1 }}
                  >
                    {cysteineData.length} cysteine
                    {cysteineData.length === 1 ? "" : "s"} detected
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        );

      case 1:
        return (
          <Box>
            <Box sx={{ mb: 2, display: "flex", gap: 1 }}>
              <Button
                variant="outlined"
                onClick={selectAll}
                startIcon={<CheckCircle />}
              >
                Select All
              </Button>
              <Button
                variant="outlined"
                onClick={unselectAll}
                startIcon={<RestartAlt />}
              >
                Clear All
              </Button>
            </Box>
            <Grid container spacing={2}>
              {backgroundOptions.map((bg) => (
                <Grid item xs={12} sm={6} md={4} key={bg.value}>
                  <Paper
                    sx={{
                      p: 2,
                      cursor: "pointer",
                      bgcolor: backgroundSelections.includes(bg.value)
                        ? "primary.light"
                        : "background.paper",
                      color: backgroundSelections.includes(bg.value)
                        ? "white"
                        : "text.primary",
                      "&:hover": {
                        bgcolor: backgroundSelections.includes(bg.value)
                          ? "primary.main"
                          : "grey.100",
                      },
                    }}
                    onClick={() => handleToggleBackground(bg.value)}
                  >
                    <Typography variant="body1">{bg.label}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Box>
        );

      case 2:
        return (
          <RadioGroup
            value={annotationType}
            onChange={(e) => setAnnotationType(e.target.value)}
            sx={{ display: "flex", flexDirection: "row", gap: 2 }}
          >
            {[
              {
                value: "molecular",
                label: "Molecular Features",
                icon: <Science />,
              },
              {
                value: "experimental",
                label: "Experimental Data",
                icon: <Category />,
              },
              { value: "structural", label: "Structural", icon: <PlayArrow /> },
            ].map((option) => (
              <Paper
                key={option.value}
                sx={{
                  p: 2,
                  flex: 1,
                  cursor: "pointer",
                  bgcolor:
                    annotationType === option.value
                      ? "primary.light"
                      : "background.paper",
                  color:
                    annotationType === option.value ? "white" : "text.primary",
                  "&:hover": {
                    bgcolor:
                      annotationType === option.value
                        ? "primary.main"
                        : "grey.100",
                  },
                }}
              >
                <FormControlLabel
                  value={option.value}
                  control={<Radio sx={{ display: "none" }} />}
                  label={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      {option.icon}
                      <Typography variant="body1">{option.label}</Typography>
                    </Box>
                  }
                  sx={{ m: 0, width: "100%" }}
                />
              </Paper>
            ))}
          </RadioGroup>
        );

      case 3:
        return (
          <Box>
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Analysis Configuration
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Foreground Data
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{ wordBreak: "break-word" }}
                    >
                      {inputMethod === "csv"
                        ? foregroundFile?.name
                        : `${cysteineData.length} cysteine${
                            cysteineData.length === 1 ? "" : "s"
                          } from text entry`}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Selected Backgrounds
                    </Typography>
                    {backgroundSelections.length > 0 ? (
                      <ul>
                        {backgroundSelections.map((background, index) => (
                          <li key={index}>
                            <Typography variant="body1">
                              {
                                backgroundOptions.find(
                                  (opt) => opt.value === background
                                )?.label
                              }
                            </Typography>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Typography variant="body1">
                        No backgrounds selected
                      </Typography>
                    )}
                  </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Annotation Type
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{ textTransform: "capitalize" }}
                    >
                      {annotationType}
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
            </Box>

            <Button
              variant="contained"
              size="large"
              startIcon={<PlayCircle />}
              onClick={startAnalysis}
              disabled={
                (!foregroundFile && cysteineData.length === 0) ||
                backgroundSelections.length === 0
              }
              sx={{ mb: 3 }}
            >
              Start Analysis
            </Button>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Paper
          sx={{
            p: 0,
            mb: 4,
            overflow: "hidden",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            borderRadius: "16px",
          }}
        >
          <Box>
            <Box
              sx={{
                p: 4,
                pt: 5,
                pb: 5,
                background: "linear-gradient(135deg, #34495e 0%, #2c3e50 100%)",
                position: "relative",
                borderBottom: "4px solid rgba(255,255,255,0.2)",
              }}
            >
              <Typography
                variant="h3"
                fontWeight="800"
                color="white"
                gutterBottom
                sx={{
                  textShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  letterSpacing: "-0.5px",
                }}
              >
                CSEA Analysis
              </Typography>
              <Typography
                variant="h6"
                color="rgba(255,255,255,0.95)"
                sx={{
                  maxWidth: "80%",
                  fontWeight: 400,
                  textShadow: "0 1px 2px rgba(0,0,0,0.1)",
                  mb: 2,
                }}
              >
                Comprehensive analysis tool for cysteine modifications in cancer
                research
              </Typography>

              <Box
                sx={{
                  position: "absolute",
                  right: "5%",
                  top: 0,
                  height: "100%",
                  display: { xs: "none", md: "flex" },
                  alignItems: "center",
                  opacity: 0.8,
                }}
              >
                <Science sx={{ fontSize: 180, color: "white" }} />
              </Box>
            </Box>
            <Box
              sx={{
                width: "100%",
                height: "auto",
                maxHeight: "300px",
                overflow: "hidden",
                display: "flex",
                justifyContent: "center",
                borderTop: `1px solid ${theme.palette.grey[100]}`,
                borderBottom: `1px solid ${theme.palette.grey[100]}`,
                backgroundColor: "#f8f9fa",
              }}
            >
              <Box
                component="img"
                src="/NCI60_breakdown.png"
                alt="NCI60 Breakdown"
                sx={{
                  width: "100%",
                  height: "auto",
                  objectFit: "contain",
                }}
              />
            </Box>
          </Box>
          <Box sx={{ p: 4 }}>
            {error && (
              <Alert
                severity="error"
                sx={{ mb: 3 }}
                onClose={() => setError(null)}
              >
                {error}
              </Alert>
            )}

            <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
              {STEPS.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>

            <Box sx={{ mt: 4, mb: 4 }}>{getStepContent(activeStep)}</Box>

            <Box
              sx={{ display: "flex", justifyContent: "space-between", mt: 2 }}
            >
              <Button
                variant="outlined"
                onClick={() => {
                  if (activeStep === 0 || jobStatus !== "") {
                    resetAnalysis();
                  } else {
                    setActiveStep((prev) => Math.max(0, prev - 1));
                  }
                }}
              >
                {activeStep === 0 || jobStatus !== "" ? "New Analysis" : "Back"}
              </Button>
              <Button
                variant="contained"
                onClick={() =>
                  setActiveStep((prev) => Math.min(STEPS.length - 1, prev + 1))
                }
                disabled={
                  activeStep === STEPS.length - 1 ||
                  jobStatus !== "" ||
                  (activeStep === 0 &&
                    inputMethod === "csv" &&
                    !foregroundFile) ||
                  (activeStep === 0 &&
                    inputMethod === "text" &&
                    cysteineData.length === 0) ||
                  (activeStep === 1 && backgroundSelections.length === 0)
                }
              >
                {activeStep === STEPS.length - 1 ? "Finish" : "Next"}
              </Button>
            </Box>
          </Box>
        </Paper>

        {jobId && (
          <Paper sx={{ p: 4 }}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="h5" gutterBottom>
                Analysis Status
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <Paper sx={{ p: 2, bgcolor: "grey.50" }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Job ID
                    </Typography>
                    <Typography variant="body1">{jobId}</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Paper sx={{ p: 2, bgcolor: "grey.50" }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Status
                    </Typography>
                    <Chip
                      label={jobStatus}
                      color={
                        jobStatus === "COMPLETED"
                          ? "success"
                          : jobStatus === "ERROR"
                          ? "error"
                          : "primary"
                      }
                      sx={{ mt: 1 }}
                    />
                  </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Paper sx={{ p: 2, bgcolor: "grey.50" }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Progress
                    </Typography>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        mt: 1,
                      }}
                    >
                      <CircularProgress
                        variant="determinate"
                        value={progress}
                        size={24}
                        thickness={6}
                      />
                      <Typography variant="body2">{progress}%</Typography>
                    </Box>
                  </Paper>
                </Grid>
              </Grid>
            </Box>

            {jobStatus === "COMPLETED" && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Results
                </Typography>

                {jobStatus === "COMPLETED" &&
                  (analysisStats ||
                    logs.some((log) => log.includes("stats"))) && (
                    <Paper
                      sx={{
                        mb: 4,
                        p: 3,
                        background:
                          "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
                        borderRadius: 3,
                        boxShadow: "0 10px 20px rgba(0,0,0,0.08)",
                        borderLeft: "5px solid",
                        borderColor: "primary.main",
                        overflow: "hidden",
                        position: "relative",
                      }}
                    >
                      <Typography
                        variant="h5"
                        fontWeight="600"
                        color="primary.dark"
                        gutterBottom
                        sx={{
                          borderBottom: "2px solid",
                          borderColor: "primary.light",
                          pb: 1,
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                        }}
                      >
                        <Science sx={{ fontSize: 28 }} /> Analysis Statistics
                      </Typography>

                      <Grid container spacing={2} sx={{ mt: 1 }}>
                        {analysisStats
                          ? Object.entries(analysisStats).map(
                              ([key, value]) => (
                                <Grid item xs={12} sm={6} md={4} key={key}>
                                  <Box
                                    sx={{
                                      p: 2,
                                      borderRadius: 2,
                                      bgcolor: "rgba(255,255,255,0.7)",
                                      backdropFilter: "blur(5px)",
                                      boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                                      height: "100%",
                                      display: "flex",
                                      flexDirection: "column",
                                      justifyContent: "center",
                                      transition:
                                        "transform 0.2s, box-shadow 0.2s",
                                      "&:hover": {
                                        transform: "translateY(-2px)",
                                        boxShadow: "0 6px 16px rgba(0,0,0,0.1)",
                                      },
                                    }}
                                  >
                                    <Typography
                                      variant="body2"
                                      color="text.secondary"
                                      sx={{
                                        textTransform: "uppercase",
                                        letterSpacing: "0.5px",
                                        fontWeight: 500,
                                        fontSize: "0.75rem",
                                        mb: 0.5,
                                      }}
                                    >
                                      {key
                                        .replace(/_/g, " ")
                                        .replace(/n /g, "# ")
                                        .replace(/size /g, "size: ")}
                                    </Typography>
                                    <Typography
                                      variant="h6"
                                      fontWeight="bold"
                                      color="primary.dark"
                                      sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        fontSize: {
                                          xs: "1.25rem",
                                          md: "1.5rem",
                                        },
                                      }}
                                    >
                                      {typeof value === "number"
                                        ? value.toLocaleString()
                                        : value !== null && value !== undefined
                                        ? String(value)
                                        : "-"}
                                    </Typography>
                                  </Box>
                                </Grid>
                              )
                            )
                          : logs.map((log) => {
                              try {
                                const logObj = JSON.parse(log);
                                if (logObj.stats) {
                                  return Object.entries(logObj.stats).map(
                                    ([key, value]) => (
                                      <Grid
                                        item
                                        xs={12}
                                        sm={6}
                                        md={4}
                                        key={key}
                                      >
                                        <Box
                                          sx={{
                                            p: 2,
                                            borderRadius: 2,
                                            bgcolor: "rgba(255,255,255,0.7)",
                                            backdropFilter: "blur(5px)",
                                            boxShadow:
                                              "0 4px 12px rgba(0,0,0,0.05)",
                                            height: "100%",
                                            display: "flex",
                                            flexDirection: "column",
                                            justifyContent: "center",
                                            transition:
                                              "transform 0.2s, box-shadow 0.2s",
                                            "&:hover": {
                                              transform: "translateY(-2px)",
                                              boxShadow:
                                                "0 6px 16px rgba(0,0,0,0.1)",
                                            },
                                          }}
                                        >
                                          <Typography
                                            variant="body2"
                                            color="text.secondary"
                                            sx={{
                                              textTransform: "uppercase",
                                              letterSpacing: "0.5px",
                                              fontWeight: 500,
                                              fontSize: "0.75rem",
                                              mb: 0.5,
                                            }}
                                          >
                                            {key
                                              .replace(/_/g, " ")
                                              .replace(/n /g, "# ")
                                              .replace(/size /g, "size: ")}
                                          </Typography>
                                          <Typography
                                            variant="h6"
                                            fontWeight="bold"
                                            color="primary.dark"
                                            sx={{
                                              display: "flex",
                                              alignItems: "center",
                                              fontSize: {
                                                xs: "1.25rem",
                                                md: "1.5rem",
                                              },
                                            }}
                                          >
                                            {typeof value === "number"
                                              ? value.toLocaleString()
                                              : value !== null &&
                                                value !== undefined
                                              ? String(value)
                                              : "-"}
                                          </Typography>
                                        </Box>
                                      </Grid>
                                    )
                                  );
                                }
                                return null;
                              } catch (e) {
                                return null;
                              }
                            })}
                      </Grid>
                    </Paper>
                  )}

                <Grid container spacing={2} sx={{ mb: 3 }}>
                  {outputFiles.map((fileObj) => {
                    const isPngFile = fileObj.filename.endsWith(".png");
                    return (
                      <Grid item xs={12} sm={6} md={4} key={fileObj.filename}>
                        <Paper
                          sx={{
                            p: 2,
                            transition: "all 0.2s",
                            border:
                              selectedFilePreview === fileObj.filename
                                ? "2px solid"
                                : "1px solid",
                            borderColor:
                              selectedFilePreview === fileObj.filename
                                ? "primary.main"
                                : "grey.200",
                            backgroundColor: isPngFile
                              ? selectedFilePreview === fileObj.filename
                                ? "rgba(37, 99, 235, 0.05)"
                                : "white"
                              : "white",
                            boxShadow: isPngFile
                              ? "0 4px 12px rgba(0,0,0,0.08)"
                              : "0 2px 8px rgba(0,0,0,0.05)",
                            position: "relative",
                            overflow: "hidden",
                          }}
                        >
                          {isPngFile && (
                            <Box
                              sx={{
                                position: "absolute",
                                top: 0,
                                right: 0,
                                backgroundColor: "primary.main",
                                color: "white",
                                fontSize: "0.7rem",
                                py: 0.5,
                                px: 1,
                                fontWeight: "bold",
                                borderBottomLeftRadius: 8,
                                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                              }}
                            >
                              PLOT
                            </Box>
                          )}

                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              mb: 1,
                            }}
                          >
                            {isPngFile ? (
                              <Image sx={{ mr: 1, color: "primary.main" }} />
                            ) : (
                              <TableView
                                sx={{ mr: 1, color: "text.secondary" }}
                              />
                            )}
                            <Typography
                              variant="body2"
                              fontWeight={
                                selectedFilePreview === fileObj.filename
                                  ? 500
                                  : 400
                              }
                              color={
                                selectedFilePreview === fileObj.filename
                                  ? "primary"
                                  : "text.secondary"
                              }
                              noWrap
                              sx={{ flex: 1 }}
                            >
                              {fileObj.filename}
                            </Typography>
                          </Box>

                          {isPngFile && (fileObj as OutputFile).url && (
                            <Box
                              sx={{
                                height: "60px",
                                overflow: "hidden",
                                mb: 1.5,
                                borderRadius: 1,
                                boxShadow: "inset 0 0 6px rgba(0,0,0,0.1)",
                                border: "1px solid rgba(0,0,0,0.07)",
                              }}
                            >
                              <Box
                                component="img"
                                src={(fileObj as OutputFile).url}
                                alt={fileObj.filename}
                                sx={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                  objectPosition: "center",
                                  transition: "all 0.3s ease",
                                  filter: "contrast(0.95)",
                                  cursor: "zoom-in",
                                }}
                                onClick={() =>
                                  fetchAndPreviewCsv(fileObj.filename)
                                }
                              />
                            </Box>
                          )}

                          <Box sx={{ display: "flex", gap: 1 }}>
                            <Button
                              variant={isPngFile ? "contained" : "outlined"}
                              color={isPngFile ? "primary" : "primary"}
                              size="small"
                              startIcon={<Visibility />}
                              sx={{ flex: 1 }}
                              onClick={() =>
                                fetchAndPreviewCsv(fileObj.filename)
                              }
                            >
                              Preview
                            </Button>

                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<Download />}
                              sx={{ flex: 1 }}
                              onClick={async () => {
                                try {
                                  if ((fileObj as OutputFile).url) {
                                    window.open(
                                      (fileObj as OutputFile).url,
                                      "_blank"
                                    );
                                  } else {
                                    const storageRef = ref(
                                      storage,
                                      `results/${jobId}/${fileObj.filename}`
                                    );
                                    const url = await getDownloadURL(
                                      storageRef
                                    );
                                    window.open(url, "_blank");
                                  }
                                } catch (error) {
                                  setError(
                                    "Unable to access file. Please try again later."
                                  );
                                }
                              }}
                            >
                              Download
                            </Button>
                          </Box>
                        </Paper>
                      </Grid>
                    );
                  })}
                </Grid>

                {selectedFilePreview &&
                  selectedFilePreview.endsWith(".png") && (
                    <Paper
                      sx={{
                        p: 3,
                        borderRadius: 2,
                        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                        mb: 3,
                        overflow: "hidden",
                        backgroundColor: "#ffffff",
                        border: "1px solid rgba(0,0,0,0.05)",
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          mb: 2,
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center" }}>
                          <FileOpen sx={{ mr: 1, color: "primary.main" }} />
                          <Typography variant="subtitle1" fontWeight={500}>
                            {selectedFilePreview}
                          </Typography>
                        </Box>

                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<Download />}
                          onClick={async () => {
                            try {
                              const fileObj = outputFiles.find(
                                (f: OutputFile) =>
                                  f.filename === selectedFilePreview
                              );
                              if (fileObj && fileObj.url) {
                                window.open(fileObj.url, "_blank");
                              } else {
                                const storageRef = ref(
                                  storage,
                                  `results/${jobId}/${selectedFilePreview}`
                                );
                                const url = await getDownloadURL(storageRef);
                                window.open(url, "_blank");
                              }
                            } catch (error) {
                              setError(
                                "Unable to access file. Please try again later."
                              );
                            }
                          }}
                        >
                          Download Image
                        </Button>
                      </Box>

                      <Box
                        sx={{
                          mt: 3,
                          mb: 4,
                          position: "relative",
                        }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            alignItems: "center",
                            position: "relative",
                            borderRadius: 3,
                            backgroundColor: "#fcfcfc",
                            backgroundImage:
                              "linear-gradient(0deg, #f5f7fa 0%, #ffffff 100%)",
                            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
                            p: { xs: 2, sm: 4 },
                            mx: { xs: 0, sm: 2, md: 4 },
                            border: "1px solid rgba(0,0,0,0.05)",
                            overflow: "hidden",
                            minHeight: "400px",
                            "&::before": {
                              content: '""',
                              position: "absolute",
                              top: 0,
                              left: 0,
                              right: 0,
                              height: "4px",
                              background:
                                "linear-gradient(90deg, #2563eb, #7c3aed)",
                              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                            },
                          }}
                        >
                          {outputFiles.find(
                            (f: OutputFile) =>
                              f.filename === selectedFilePreview
                          )?.url ? (
                            <Box
                              sx={{
                                position: "relative",
                                width: "100%",
                                display: "flex",
                                justifyContent: "center",
                              }}
                            >
                              <Box
                                component="img"
                                src={
                                  outputFiles.find(
                                    (f: OutputFile) =>
                                      f.filename === selectedFilePreview
                                  )?.url
                                }
                                alt={selectedFilePreview}
                                sx={{
                                  maxWidth: "100%",
                                  maxHeight: "600px",
                                  objectFit: "contain",
                                  borderRadius: "4px",
                                  boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                                  transition: "all 0.3s ease",
                                  cursor: "zoom-in",
                                  "&:hover": {
                                    transform: "scale(1.015)",
                                    boxShadow: "0 12px 28px rgba(0,0,0,0.2)",
                                  },
                                }}
                                onClick={() => {
                                  const url = outputFiles.find(
                                    (f: OutputFile) =>
                                      f.filename === selectedFilePreview
                                  )?.url;
                                  if (url) window.open(url, "_blank");
                                }}
                              />

                              <Box
                                sx={{
                                  position: "absolute",
                                  bottom: 10,
                                  right: 10,
                                  backgroundColor: "rgba(0,0,0,0.7)",
                                  color: "white",
                                  padding: "4px 8px",
                                  borderRadius: 1,
                                  fontSize: "0.75rem",
                                  opacity: 0.8,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 0.5,
                                  pointerEvents: "none",
                                }}
                              >
                                <Visibility
                                  fontSize="small"
                                  sx={{ fontSize: "0.9rem" }}
                                />
                                Click to enlarge
                              </Box>
                            </Box>
                          ) : (
                            <Box
                              sx={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                height: "300px",
                              }}
                            >
                              <CircularProgress size={48} />
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ mt: 2 }}
                              >
                                Loading visualization...
                              </Typography>
                            </Box>
                          )}
                        </Box>

                        <Box
                          sx={{
                            mt: 3,
                            textAlign: "center",
                          }}
                        >
                          <Typography
                            variant="h6"
                            color="primary.dark"
                            fontWeight="500"
                            gutterBottom
                          >
                            CSEA Analysis Visualization
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ maxWidth: "600px", mx: "auto" }}
                          >
                            This plot shows enriched cysteine sites identified
                            in the analysis. Click on the image to view it in
                            full resolution.
                          </Typography>
                        </Box>
                      </Box>
                    </Paper>
                  )}

                {selectedFilePreview &&
                  !selectedFilePreview.endsWith(".png") && (
                    <Paper
                      sx={{
                        p: 3,
                        borderRadius: 2,
                        boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                        mb: 3,
                        overflow: "hidden",
                        backgroundColor: "#fafafa",
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          mb: 2,
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center" }}>
                          <FileOpen sx={{ mr: 1, color: "primary.main" }} />
                          <Typography variant="subtitle1" fontWeight={500}>
                            {selectedFilePreview}
                          </Typography>
                        </Box>

                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<Download />}
                          onClick={async () => {
                            try {
                              const storageRef = ref(
                                storage,
                                `results/${jobId}/${selectedFilePreview}`
                              );
                              const url = await getDownloadURL(storageRef);
                              window.open(url, "_blank");
                            } catch (error) {
                              setError(
                                "Unable to access file. Please try again later."
                              );
                            }
                          }}
                        >
                          Download Full File
                        </Button>
                      </Box>

                      {renderCsvTable(csvPreviews[selectedFilePreview])}
                    </Paper>
                  )}
              </Box>
            )}

            <Box>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 1,
                }}
              >
                <Typography variant="h6">Process Logs</Typography>
                <IconButton onClick={() => setExpandedLogs(!expandedLogs)}>
                  {expandedLogs ? <ExpandLess /> : <ExpandMore />}
                </IconButton>
              </Box>
              <Collapse in={expandedLogs}>
                <Paper
                  sx={{
                    p: 2,
                    maxHeight: 200,
                    overflowY: "auto",
                    bgcolor: "grey.50",
                  }}
                >
                  {logs.map((line, idx) => (
                    <Typography
                      key={idx}
                      variant="body2"
                      component="pre"
                      sx={{
                        fontFamily: "monospace",
                        whiteSpace: "pre-wrap",
                        m: 0,
                        fontSize: "0.8rem",
                      }}
                    >
                      {line}
                    </Typography>
                  ))}
                </Paper>
              </Collapse>
            </Box>
          </Paper>
        )}
        <AcknowledgementsBox />
      </Container>
    </ThemeProvider>
  );
}

export default App;
