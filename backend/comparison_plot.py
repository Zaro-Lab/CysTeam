import os
from glob import glob
from io import StringIO
from datetime import datetime
from tqdm import tqdm
import re

import numpy as np
import pandas as pd

import matplotlib
import matplotlib.pyplot as plt

def generate_feature_plot_with_reference_comparison(
        fp_user_result:str, 
        fp_ref_result:str,
        fpout:str, 
        p_final:float=0.05) -> str:
    
    """
    """
    # Create right plot dataframe
    df = pd.read_csv(fp_user_result)
    df_rplot = df[df['p_final'] < p_final]
    if df_rplot.shape[0] == 0:
        return None
    df_rplot['-log10p'] = df_rplot['p_final'].apply(lambda x: -np.log10(x))
    df_rplot = df_rplot[['set_name', '-log10p']].set_index('set_name') \
        .head(20) \
        .sort_values('-log10p', ascending=True)

    # Create corresponding left plot dataframe
    # find matching features in the reference plot, to be plotted on the left

    df_ref = pd.read_csv(fp_ref_result)
    df_lplot = df_ref[df_ref['set_name'].isin(df_rplot.index)]
    df_lplot['-log10p'] = df_lplot['p_final'].apply(lambda x: -np.log10(x))
    df_lplot = df_lplot[['set_name', '-log10p']].set_index('set_name')
    # find features w/o matches in the reference, and append to df_plot, fill with 0
    ls_feature_not_in_lplot = df_rplot[~df_rplot.index.isin(df_lplot.index)].index.tolist()
    if len(ls_feature_not_in_lplot) > 0:
        df_to_cat = pd.DataFrame(np.zeros((len(ls_feature_not_in_lplot), df_lplot.shape[1])))
        df_to_cat.index = ls_feature_not_in_lplot
        df_lplot = pd.concat([df_lplot, df_to_cat], axis=0)

    # reorder df_lplot to match right plot feature orders
    df_lplot = df_lplot.loc[df_rplot.index,:]

    xmax = max(df_lplot['-log10p'].max(), df_rplot['-log10p'].max())*1.1
    xmin = 0


    fig, (ax1, ax2) = plt.subplots(1, 2, sharey=True)

    df_lplot.plot(kind='barh', ax=ax1, color='pink')
    ax1.set_xlabel("-log10p")
    ax1.set_ylabel(f'Enriched Features Reference Data')
    ax1.tick_params(axis='y')
    ax1.set_xlim(xmin, xmax)
    ax1.invert_xaxis()
    ax1.get_legend().remove()

    df_rplot.plot(kind='barh', ax=ax2, color='skyblue')
    ax2.set_xlabel("-log10p")
    ax2.set_ylabel(f'Enriched Features')
    ax2.yaxis.tick_right()
    ax2.tick_params(axis='y', labelcolor='skyblue')
    ax2.set_xlim(xmin, xmax)
    ax2.get_legend().remove()

    # Add a title to the entire figure
    plt.suptitle('Left: Reference, Right: User Input')
    plt.subplots_adjust(wspace=0)

    plt.savefig(fpout, dpi=300, bbox_inches='tight')
    
    return fpout