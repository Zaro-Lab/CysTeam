# CysTeam: CSEA (Cysteine Set Enrichment Analysis) Web Application

<div align="center">

[![Built with React](https://img.shields.io/badge/Built%20with-React-61DAFB?style=flat-square&logo=react)](https://reactjs.org/)
[![Backend: Firebase](https://img.shields.io/badge/Backend-Firebase-FFCA28?style=flat-square&logo=firebase)](https://firebase.google.com/)
[![Python 3.11](https://img.shields.io/badge/Python-3.11-blue?style=flat-square&logo=python)](https://www.python.org/)
[![R Shiny](https://img.shields.io/badge/R-Shiny-276DC3?style=flat-square&logo=r)](https://shiny.rstudio.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

<img width="1526" alt="Screenshot 2025-03-09 at 4 00 40 PM" src="https://github.com/user-attachments/assets/ca7fe4d3-c080-4f91-92d7-b336b25aa1a3" />

</div>

## Table of Contents
- [System Overview](#system-overview)
- [CSEA Algorithm](#csea-algorithm)
  - [Algorithm Overview](#algorithm-overview)
  - [Statistical Approach](#statistical-approach)
- [Data Models](#data-models)
  - [Firestore Collections](#firestore-collections)
  - [Cloud Storage Organization](#cloud-storage-organization)
- [API Endpoints](#api-endpoints)
  - [Cloud Functions API](#cloud-functions-api)
- [R Shiny Application](#r-shiny-application)
  - [Features](#features)
  - [Data Sources](#data-sources)
  - [Implementation](#implementation)
- [Deployment](#deployment)
  - [Frontend Deployment](#frontend-deployment)
  - [Backend Deployment](#backend-deployment)
  - [Local Development](#local-development)
- [Acknowledgements](#acknowledgements)
- [Contributors](#contributors)

## System Overview

As the CysTeam, we're submitting a suite of specialized web-based bioinformatics tools for analyzing cysteine modifications in cancer research.

1. Upload custom cysteine datasets or input them directly via text
2. Select appropriate background datasets from various cancer tissue types
3. Choose annotation types for enrichment analysis
4. Run the CSEA algorithm to identify statistically significant enriched features
5. Visualize and download results including enriched feature plots, detailed statistics, and comparison plots

## CSEA Algorithm

The CSEA (Cysteine Set Enrichment Analysis) algorithm is implemented in `csea500b.py` and represents the core analytical component of the system.
<img width="312" alt="Screenshot 2025-03-09 at 3 52 37 PM" src="https://github.com/user-attachments/assets/01b4013c-2245-4ab5-9493-b8a349947933" />

### Algorithm Overview

1. **Input Processing**
   - User-provided cysteine modifications list
   - Selected background dataset(s)
   - Annotation datasets matching the selected type

2. **Enrichment Analysis**
   - Statistical permutation testing (default: 500 permutations)
   - P-value calculation using Gaussian kernel density estimation
   - Multiple testing correction using Benjamini-Hochberg FDR

3. **Result Generation**
   - Enrichment scores and statistical significance values
   - Visualization outputs (barplots, heatmaps)
   - Detailed CSV result files

### Statistical Approach

The algorithm uses a permutation-based enrichment analysis approach:

1. The input cysteine list is compared against annotation sets
2. Random permutations of background cysteines are generated
3. The number of intersections with each annotation set is calculated
4. Kernel density estimation is used to calculate a p-value distribution
5. Multiple testing correction is applied to control for false discoveries

## Data Models

### Firestore Collections

**analysisJobs**
```typescript
interface AnalysisJob {
  jobId: string;
  status: 'QUEUED' | 'INITIALIZING' | 'RUNNING' | 'COMPLETED' | 'ERROR';
  step: string;
  createdAt: Timestamp;
  lastUpdated: Timestamp;
  foregroundFilePath: string;
  backgroundSelections: string[];
  annotationSelection: string;
  progress: number;
  logs: string[];
  outputFiles: OutputFile[];
  stats: AnalysisStats;
  error?: string;
}

interface OutputFile {
  filename: string;
  url: string;
}

interface AnalysisStats {
  size_permutation: number;
  n_Anno_inSet: number;
  n_cys_input: number;
  n_bg_input: number;
  n_cys_notinAnno: number;
  n_bg_notinAnno: number;
}
```

### Cloud Storage Organization

```
zaro-lab.firebasestorage.app/
├── aggregated_tissue_cysteines/    # Background reference data
│   ├── Updated_Breast_Cancer_Cysteine_Master_List.csv
│   ├── Updated_Colon_Cancer_Cysteine_Master_List.csv
│   └── ...
├── reference/                      # Annotation reference data
│   ├── df_annotation_sub_molecular_features.csv
│   ├── df_annotation_sub_experimental_data.csv
│   ├── df_annotation_sub_structural.csv
│   ├── bgcys_anno_molecular_features.csv
│   └── ...
├── uploads/                        # User uploaded data
│   ├── {jobId}/
│   │   └── foreground.csv
│   └── ...
└── results/                        # Analysis results
    ├── {jobId}/
    │   ├── csea_barplot.png
    │   ├── result_{filename}_seed{seed}.csv
    │   └── ...
    └── ...
```

## API Endpoints

### Cloud Functions API

#### `run_analysis`
- **Method:** POST
- **Content-Type:** application/json
- **Request Body:**
  ```json
  {
    "jobId": "string",
    "foregroundFilePath": "string",
    "backgroundSelections": ["string"],
    "annotationSelection": "string"
  }
  ```
- **Response:**
  ```json
  {
    "message": "Analysis completed",
    "outputFiles": [
      {
        "filename": "string",
        "url": "string"
      }
    ],
    "stats": {
      "size_permutation": "number",
      "n_Anno_inSet": "number",
      "n_cys_input": "number",
      "n_bg_input": "number",
      "n_cys_notinAnno": "number",
      "n_bg_notinAnno": "number"
    }
  }
  ```

#### `preview_csv`
- **Method:** GET
- **Query Parameters:**
  - `jobId`: string
  - `filename`: string
- **Response:**
  ```json
  {
    "headers": ["string"],
    "rows": [["string"]],
    "rowCount": "number",
    "totalRows": "number"
  }
  ```

## R Shiny Application

The project includes a complementary R Shiny application (`app_cysteins_v4.R`) that provides specialized visualization and exploration of NCI60 protein data.
<img width="2299" alt="Screenshot 2025-03-09 at 3 51 36 PM" src="https://github.com/user-attachments/assets/b4d82310-0c23-4542-838f-d95c50d8d58c" />

### Features

1. **Protein Search**
   - Search by protein IDs
   - Filter by cell lines or tissue types
   - Minimum mass spec intensity threshold configuration

2. **Visualization**
   - Heatmap visualization of protein expression
   - Gene analysis text output
   - Minimum cell line coverage calculation

### Data Sources

- `cystein_protein_master_cys_supplemented.RData`: Primary protein expression dataset
- `cellline2tissue.csv`: Cell line to tissue type mapping
- `human_kinases_list.csv`: Reference list of human kinases

### Implementation

The R Shiny app uses:
- `shiny` for reactive web interface
- `ggplot2` for data visualization
- `pheatmap` for heatmap generation
- Custom data processing for protein expression analysis

## Deployment

### Frontend Deployment

The React frontend is built and deployed to Firebase Hosting:

```bash
# Build production assets
cd frontend
npm install
npm run build

# Deploy to Firebase
firebase deploy --only hosting
```

### Backend Deployment

The Python backend functions are deployed to Firebase Cloud Functions:

```bash
# Deploy cloud functions
cd backend
firebase deploy --only functions
```

### Local Development

1. **Frontend:**
   ```bash
   cd frontend
   npm install
   npm start
   ```

2. **Backend:**
   ```bash
   cd backend
   # Create virtual environment
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   
   # Install dependencies
   pip install -r functions/requirements.txt
   
   # Start Firebase emulators
   firebase emulators:start
   ```

3. **R Shiny:**
   ```bash
   cd rshiny
   Rscript -e "shiny::runApp('.', port=3838)"
   ```

---

## Acknowledgements

CSEA was developed by the [Bar-Peled Lab](https://www.barpeledlab.org) as part of [DrugMap](https://www.cell.com/cell/fulltext/S0092-8674(24)00318-0#sec-4) and the original code is [publicly available on GitHub](https://github.com/bplab-compbio/DrugMap/tree/main/CSEA). CSEA was adapted as an online tool by the [Zaro Lab](https://pharm.ucsf.edu/zaro).

## Contributors

- José Montaño (University of California - San Francisco)
- Vee Xu (University of California - San Francisco Gladstone Institutes)
- Vishnu Rajan Tejus (University of California - Berkeley)
