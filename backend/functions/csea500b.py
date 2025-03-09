#!/usr/bin/env python3
import os
from glob import glob
import io
from io import StringIO
from datetime import datetime
from tqdm import tqdm

import numpy as np
import pandas as pd

import re
from collections import Counter
from collections import OrderedDict

from scipy.stats import gaussian_kde
from scipy.integrate import quad
from statsmodels.stats.multitest import multipletests
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


def create_output_directory(base_path):
    os.makedirs(base_path, exist_ok=True)
    return base_path


def get_input_and_bg_cys(fp_cys: str, fp_bg: str):
    df_cys = pd.read_csv(fp_cys, header=None)
    S_cys = df_cys.iloc[:,0].apply(lambda x: re.sub('_', ' ', x))

    df_bg = pd.read_csv(fp_bg, header=None)
    S_bg = df_bg.iloc[:,0].apply(lambda x: re.sub('_', ' ', x))

    return S_cys, S_bg


def get_annotated_cys(ls_cys, ls_annotation):
    S_inAnno = pd.Series(list(set(ls_annotation).intersection(ls_cys)))
    return S_inAnno.copy()


def generate_perm(n_perm, size_per_perm, n_feature, S_bgcys, S_cys, seed: int = 42):
    np.random.seed(seed)
    random_draws = np.random.choice(
        S_bgcys,
        (n_feature, n_perm, size_per_perm),
        replace=True)
    S = pd.Series(random_draws.tolist())
    return random_draws


def calculate_n_intersect(ls_ls_perm, S_cys):
    ls_n_intersection = [len(set(ls_perm).intersection(S_cys))
                         for ls_perm in ls_ls_perm]
    return ls_n_intersection


def calculate_bin_midpoints(bin_edges):
    return (bin_edges[:-1] + bin_edges[1:]) / 2


def perform_permutation(df,
                        S_cys_inAnno,
                        S_bg_inAnno,
                        n_feature: int,
                        n_perm: int,
                        size_per_perm: int,
                        log_offset: float = 0.0001,
                        seed: int = 42,
                        batch_size: int = 250,
                        return_all: bool = False,
                        ):
    pd.options.mode.chained_assignment = None
    np.random.seed(seed)

    df = df.copy()
    size_df = df.shape[0]

    df[f'ls_n_intersection_{n_perm}'] = [None] * size_df
    df[f'hist_{n_perm}'] = [None] * size_df
    df[f'bin_edges_{n_perm}'] = [None] * size_df
    df[f'hist_n_perm_{n_perm}'] = [None] * size_df
    df[f'bin_midpoints_{n_perm}'] = [None] * size_df
    df[f'len_bin_midpoints_{n_perm}'] = [None] * size_df
    df[f'kde_{n_perm}'] = [None] * size_df
    df[f'integral_{n_perm}'] = [None] * size_df
    df[f'p_{n_perm}'] = [None] * size_df
    df[f'neg_log10p_{n_perm}'] = [None] * size_df

    for start in range(0, size_df, batch_size):
        end = min(start + batch_size, size_df)
        chunk = df.iloc[start:end].copy()

        chunk_ls_n_intersection = []
        chunk_hist = []
        chunk_bin_edges = []
        chunk_bin_midpoints = []
        chunk_hist_n_perm = []
        chunk_len_bin_midpoints = []
        chunk_kde = []
        chunk_integral = []
        chunk_pval = []
        chunk_neglog10p = []

        for idx, row in chunk.iterrows():
            random_draws = np.random.choice(S_bg_inAnno, (n_perm, size_per_perm), replace=True)
            n_intersect = [
                len(set(random_draws[j]).intersection(S_cys_inAnno))
                for j in range(n_perm)
            ]

            chunk_ls_n_intersection.append(n_intersect)

            hist_vals, bin_edges = np.histogram(n_intersect, bins='auto', density=True)
            chunk_hist.append((hist_vals, bin_edges))
            chunk_bin_edges.append(bin_edges)
            chunk_hist_n_perm.append(hist_vals)

            bin_mids = calculate_bin_midpoints(bin_edges)
            chunk_bin_midpoints.append(bin_mids)
            chunk_len_bin_midpoints.append(len(bin_mids))

            if len(bin_mids) <= 2:
                chunk_kde.append(np.NaN)
                chunk_integral.append((np.NaN, np.NaN))
                chunk_pval.append(np.NaN)
                chunk_neglog10p.append(np.NaN)
            else:
                kde_fit = gaussian_kde(n_intersect)
                chunk_kde.append(kde_fit)
                n_cys_x = row['n_cys_x_set']
                integral_val = quad(kde_fit, n_cys_x, np.inf, epsrel=1e-4, epsabs=1e-6)
                chunk_integral.append(integral_val)

                pval = integral_val[0]
                chunk_pval.append(pval)
                chunk_neglog10p.append(-np.log10(pval + log_offset))

        chunk[f'ls_n_intersection_{n_perm}'] = chunk_ls_n_intersection
        chunk[f'hist_{n_perm}'] = chunk_hist
        chunk[f'bin_edges_{n_perm}'] = chunk_bin_edges
        chunk[f'hist_n_perm_{n_perm}'] = chunk_hist_n_perm
        chunk[f'bin_midpoints_{n_perm}'] = chunk_bin_midpoints
        chunk[f'len_bin_midpoints_{n_perm}'] = chunk_len_bin_midpoints
        chunk[f'kde_{n_perm}'] = chunk_kde
        chunk[f'integral_{n_perm}'] = chunk_integral
        chunk[f'p_{n_perm}'] = chunk_pval
        chunk[f'neg_log10p_{n_perm}'] = chunk_neglog10p

        df.iloc[start:end] = chunk

    if not return_all:
        cols = [
            'set_name',
            'set_type',
            'n_cys_x_set',
            'ls_cys_inSet',
            f'ls_n_intersection_{n_perm}',
            f'p_{n_perm}',
            f'neg_log10p_{n_perm}',
        ]
        return df[cols].copy()

    return df

def generate_feature_plot(df, fpout:str, p_final:float=0.05) -> str:
    df = df[df['p_final'] < 0.05].copy()
    if df.shape[0] == 0:
        return None
    
    df["-log10p"] = df['p_final'].apply(lambda x: -np.log10(x))

    fig, ax = plt.subplots(figsize=(5, 5))
    df[['set_name', '-log10p']].set_index('set_name').head(20) \
        .sort_values('-log10p', ascending=True) \
        .plot(kind='barh', ax=ax, color='skyblue')

    plt.title('Cysteine Enrichment Analysis')
    plt.xlabel('-log10(p)')
    plt.ylabel(f'Enriched Features (upto Top 20)')
    buf = io.BytesIO()
    plt.savefig(buf, format="png", dpi=300, bbox_inches='tight')
    buf.seek(0)
    image_data = buf.getvalue()

    with open(fpout, 'wb') as f:
        f.write(image_data)

    return fpout

def run_csea_analysis(fp_cys, 
                        fp_bg, 
                        fp_anno, 
                        fp_anno_bgcys, 
                        output_dir, 
                        n_perm: int = 500, 
                        batch_size:int = 25,
                        seed: int = 34,
                        return_df: bool = False):
    fn_root = re.split('/', fp_cys)[-1][:-4]
    print(f"Processing {fn_root}...")
    print("Starting CSEA analysis...")
    
    os.makedirs(output_dir, exist_ok=True)
    
    np.random.seed(seed)

    ret = {}

    df_annotation_sub = pd.read_csv(fp_anno, header=0, index_col=0)
    ls_bgcys_anno = pd.read_csv(fp_anno_bgcys, header=None)[0].to_list()

    S_cys, S_bg = get_input_and_bg_cys(fp_cys, fp_bg)
    S_cys_inAnno = get_annotated_cys(S_cys, ls_bgcys_anno)
    S_bg_inAnno = get_annotated_cys(S_bg, ls_bgcys_anno)

    ret['size_permutation'] = len(S_cys_inAnno)
    ret['n_Anno_inSet'] = len(ls_bgcys_anno)
    ret['n_cys_input']  = len(S_cys)
    ret['n_bg_input'] = len(S_bg)
    ret['n_cys_notinAnno'] = len(S_cys) - len(S_cys_inAnno)
    ret['n_bg_notinAnno'] = len(S_bg) - len(S_bg_inAnno)

    df_table = df_annotation_sub[['set_name', 'set_type', 'cys']].copy()
    df_table['ls_cys_inSet'] = df_table['cys'].str.split(',')
    df_table['n_cys_x_set'] = df_table['ls_cys_inSet'].apply(
        lambda x: len(set(x).intersection(S_cys_inAnno))
    )
    df_res_X = df_table[df_table['n_cys_x_set'] > 0].copy()

    print(f"Number of sets that intersect: {df_res_X.shape[0]}")

    size_per_perm = len(S_cys_inAnno)
    n_feature = len(df_res_X)
    log_offset = 0.0001

    print("Perform permutation...")
    df_res_X = perform_permutation(
        df_res_X,
        S_cys_inAnno,
        S_bg_inAnno,
        n_feature,
        n_perm,
        size_per_perm,
        log_offset,
        seed=seed,
        return_all=False
    )

    df_res_X['p_final'] = df_res_X[f'p_{n_perm}']
    df_res_X['ls_n_intersection_final'] = df_res_X[f'ls_n_intersection_{n_perm}']

    df_res_X['enrichment_score'] = df_res_X.apply(
        lambda x: (x['n_cys_x_set'] + 1)
                  / (np.nanmedian(x['ls_n_intersection_final']) + 1),
        axis=1
    )

    _, fdr_array, _, _ = multipletests(df_res_X['p_final'], method='fdr_bh')
    df_res_X['fdr'] = fdr_array

    df_res_X = df_res_X.sort_values('enrichment_score', ascending=False)
    df_res_X['n_cys_inSet'] = df_res_X['ls_cys_inSet'].apply(len)

    df_res_X = df_res_X[
        ~df_res_X['set_name'].str.contains('protein modifying enzyme', case=False, na=False)
    ]

    cols_final = [
        'set_name',
        'set_type',
        'n_cys_inSet',
        'n_cys_x_set',
        'p_final',
        'fdr',
        'enrichment_score'
    ]

    print("Save output...")
    fp = f"{output_dir}/result_{fn_root}_seed{seed}.csv"
    df_res_X[cols_final].to_csv(fp, header=True, index=False)
    print(f"Saved results to {fp}")

    fp = f"{output_dir}/result_{fn_root}_seed{seed}_cys_notinAnno.csv"
    S_cys[~S_cys.isin(S_cys_inAnno)].to_csv(fp, header=True, index=False)

    fp = f"{output_dir}/result_{fn_root}_seed{seed}_bg_notinAnno.csv"
    S_bg[~S_bg.isin(S_bg_inAnno)].to_csv(fp, header=True, index=False)

    if return_df:
        ret['df'] = df_res_X[cols_final].copy()

    fp_plot = f"{output_dir}/csea_barplot.png"
    fp_plot = generate_feature_plot(df_res_X[cols_final].copy(), fp_plot)
    ret['fp_plot'] = fp_plot

    return ret


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Run CSEA analysis on HR cysteins data')
    parser.add_argument('--fp_cys', required=True, help='Path to HR cysteins CSV file')
    parser.add_argument('--fp_bg', required=True, help='Path to background cysteins CSV file')
    parser.add_argument('--fp_anno', required=True, help='Path to annotation CSV file')
    parser.add_argument('--fp_anno_bgcys', required=True, help='Path to unique background cysteins in the annotation CSV file')
    parser.add_argument('--output_dir', required=True, help='Output directory for results')
    
    args = parser.parse_args()

    print('got to main.')
    run_csea_analysis(
        args.fp_cys,
        args.fp_bg,
        args.fp_anno,
        args.fp_anno_bgcys,
        args.output_dir
    )