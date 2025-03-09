library(shiny)
library(ggplot2)
library(ggrepel)
#library(Cairo)
library(grDevices)
require(pheatmap)

protein.data <- readRDS("./cystein_protein_master_cys_supplemented.RData")
#protein.data <- readRDS("./cystein_protein_master.RData")
protein.data[is.na(protein.data)] <- 0

human.kinases <- read.csv("./human_kinases_list.csv", sep = ",", header = T, stringsAsFactors =F)
kinases <- human.kinases$UniprotID

global_selected_cellline <- NULL
global_covered_protein <- NULL

cellline.name <- c(as.character(colnames(protein.data[3:ncol(protein.data)])), 
                   "all", "Breast", "Melanoma", "CNS", "NSCL", "Colon", 
                   "Ovarian", "Leukemia","Renal","Prostate")

protein.id <- as.character(protein.data$`Protein.ID`)
protein.name <- as.character(protein.data$`Protein.Name`)
ccf.cellline <- colnames(protein.data[3:ncol(protein.data)])

tissues <-read.csv("./tissue.csv", sep = ",", header = T, stringsAsFactors =F)
cellline2tissue <- read.csv("./cellline2tissue.csv", header = T, stringsAsFactors =F)

colnames(protein.data)

## testinput for testing
# testinput.ID1 <- "A0A0B4J2D5,A0A0U1RRL7,A0AVT1"
# testinput.cell_lines <- c("MALME.3M", "SNB.19", "HOP.62", "A549")
# testinput.n <- 5000

#protein <- unlist(strsplit(gsub(";",",",gsub("* ", "",testinput.ID1)), split = ","))
#cell <- c("MALME.3M", "SNB.19", "HOP.62", "A549")

#plot.data <- protein.data[protein.data$`Protein.ID` %in% protein, colnames(protein.data) %in% cell]
#rownames(plot.data) <- protein.data$`Protein.ID`[protein.data$`Protein.ID` %in% protein]
#plot.data[is.na(plot.data)] <- 0
#plot.data <- log(plot.data+1,2)
#p <- pheatmap(plot.data, breaks = c(0,log(5000 + 1,2),log(50, 2),max(plot.data)), 
#              color = c("#E8EEF6", "#A2BADA","#4575B4", "#4575B4"))
#p


ui <- fluidPage(
  titlePanel(title=div("NCI60 Protein Explorer", img(src="NCI60_breakdown.png", width=800))),
  h4("What is the minimum number of cell lines we need to detect our protein(s) of interest?"),    
  fluidRow(
    column(4,
           textInput("ID1", "Search these Protein IDs (separated by comma)", 
                     "P00519,P51451,P41240,P00533,Q05397,P42345,O14976,Q13418,P51617,O43187,Q9Y616,Q08881,P10721,P06239,P53671,B5ME19,Q9Y324,Q9Y324", 
                     width = '100%')
    ),
    
    
    column(4,
           selectizeInput(
             'cell', 
             'in these cell lines (can search "all" for all cell lines in the database)', 
             choices = cellline.name, 
             selected=c("all"), 
             multiple = TRUE
           )
    ),
    column(4,
           selectizeInput(
             'contain_cell', '(must include these cell lines)', choices = cellline.name, multiple = TRUE
           )
    )
  ),
  fluidRow(
    
    column(4,
           
           numericInput("n", "Minimum Mass Spec Intensity", min = 2000, max = 592070015, value = 5000)
    ), 
    
    column(4,
           checkboxInput("include_cystein_enriched_proteins", "Include Cysteine-enriched proteins", value=F)
    ),
    
    column(4,
           numericInput("maxline", "not to exceed max number of cell lines", min = 1, max = 59, value = 5)
    ), 
    
    actionButton("analyze_TPM", "Analyze")
    
    
  ),
  hr(),
  
  
  mainPanel(
    tabsetPanel(
      tabPanel("Heatmap",
               plotOutput("heat", width = "960", height = "600")),
      
      tabPanel("Gene analysis text", uiOutput("min.text")),
      tabPanel("Min heatmap", plotOutput("tpm.min.heat", width = "960", height = "600"))
      
    )
  )
)

server <- function(input, output, session) {
  # options(shiny.usecariro=T)
  
  updateSelectizeInput(session, 'ID2', choices = protein.id, server = TRUE)
  
  min.TPM <- eventReactive(input$analyze_TPM,{
    
    protein <- unlist(strsplit(gsub(";",",",gsub("* ", "",input$ID1)), split = ","))
    
    if (c("kinases") %in% protein) {
      protein <- kinases
      print("if kinases")
      print(protein)
    }      
    
    cell <- input$cell
    if (any(grepl("ccf",cell,ignore.case=TRUE) == T)){
      cell <- c(cell, unlist(unname(ccf.cell)))
    }
    
    if (any(input$cell == "all")){
      cell <- cellline.name }
    if (any(input$cell == "Breast")){
      cell <- cellline2tissue[cellline2tissue$Tissue %in% c("Breast"),]$Cell_Line_Name }
    if (any(input$cell == "Melanoma")){
      cell <- cellline2tissue[cellline2tissue$Tissue %in% c("Melanoma"),]$Cell_Line_Name }
    if (any(input$cell == "CNS")){
      cell <- cellline2tissue[cellline2tissue$Tissue %in% c("CNS"),]$Cell_Line_Name }
    if (any(input$cell == "NSCL")){
      cell <- cellline2tissue[cellline2tissue$Tissue %in% c("NSCL"),]$Cell_Line_Name } 
    if (any(input$cell == "Colon")){
      cell <- cellline2tissue[cellline2tissue$Tissue %in% c("Colon"),]$Cell_Line_Name }
    if (any(input$cell == "Ovarian")){
      cell <- cellline2tissue[cellline2tissue$Tissue %in% c("Ovarian"),]$Cell_Line_Name }  
    if (any(input$cell == "Leukemia")){
      cell <- cellline2tissue[cellline2tissue$Tissue %in% c("Leukemia"),]$Cell_Line_Name }        
    if (any(input$cell == "Renal")){
      cell <- cellline2tissue[cellline2tissue$Tissue %in% c("Renal"),]$Cell_Line_Name }        
    if (any(input$cell == "Prostate")){
      cell <- cellline2tissue[cellline2tissue$Tissue %in% c("Prostate"),]$Cell_Line_Name }
    
    
    
    
    #expression_table <- all.data[all.data$`Gene_Name.GEN` %in% gene, colnames(all.data) %in% cell]
    expression_table <- protein.data[protein.data$`Protein.ID` %in% protein, colnames(protein.data) %in% cell]
    expression_table[is.na(expression_table)] <- 0
    rownames(expression_table) <- protein.data$`Protein.ID`[protein.data$`Protein.ID` %in% protein]
    
    expression_above_threshold <- expression_table[, -1] > input$n[1]
    print("before including cystein-enriched proteins")
    print(rownames(expression_above_threshold))
    print(colnames(expression_above_threshold))
    
    if (input$include_cystein_enriched_proteins) {
      expression_above_threshold <- (expression_table[,-1] == 1) | (expression_table[, -1] > input$n[1])
      print("after including cystein-enriched proteins")
      print(rownames(expression_above_threshold))
      print(colnames(expression_above_threshold))
    }
    
    
    #expression_above_threshold <- expression_table[, -1] > 5
    # Initialize variables
    covered_genes <- c()  # Track the covered genes
    selected_cell_lines <- c()  # Track the selected cell lines
    
    selected_cell_lines <- input$contain_cell
    covered_genes <-  rownames(expression_table)[rowSums(expression_table[colnames(expression_table) %in% input$contain_cell] > input$n[1]) > 0]
    
    while (length(covered_genes) < nrow(expression_table) && length(selected_cell_lines) < input$maxline) {
      #while (length(covered_genes) < nrow(expression_table) && length(selected_cell_lines) < 10) {
      # Convert expression_above_threshold to a data frame and subset using remaining cell lines
      remaining_cell_lines <- setdiff(colnames(expression_above_threshold), selected_cell_lines)
      remaining_expression <- expression_above_threshold[, remaining_cell_lines, drop = FALSE]
      
      # Calculate the number of genes expressed for each remaining cell line
      num_genes_expressed <- colSums(remaining_expression, na.rm = TRUE)
      
      # Find the maximum number of genes expressed among remaining cell lines
      
      
      
      
      # Break the loop if there are no remaining cell lines with expression levels above the threshold
      if (is.infinite(max(num_genes_expressed, na.rm = TRUE))) {
        #cat("No remaining cell lines with expression levels greater than 10 to cover the remaining genes.")
        break
      }else{
        max_genes_expressed <- max(num_genes_expressed, na.rm = TRUE)
      }
      
      # Find the cell lines that cover the maximum number of genes expressed (without redundancy)
      cell_lines_covering_max_genes <- names(num_genes_expressed[num_genes_expressed == max_genes_expressed])
      cell_lines_covering_max_genes <- setdiff(cell_lines_covering_max_genes, selected_cell_lines)
      
      # Update the covered genes and selected cell lines
      covered_genes <- union(covered_genes, rownames(expression_table)[remaining_expression[, cell_lines_covering_max_genes[1]]])
      
      selected_cell_lines <- c(selected_cell_lines, cell_lines_covering_max_genes[1])
    }
    
    # selected_cell_lines
    global_selected_cells <<- selected_cell_lines
    global_covered_genes <<- covered_genes
    
    
  })  
  output$heat <- renderPlot({
    
    protein <- unlist(strsplit(gsub(";",",",gsub("* ", "",input$ID1)), split = ","))
    #print(protein)
    protein <- c(protein, input$ID2)
    if (c("kinases") %in% protein) {
      protein <- c(protein, kinases)
      #protein <- sample(protein)
      print("if kinases")
      print(protein)
    } 
    #print(protein)
    #print('input ID1')
    #print(input$ID1)
    ##print('input cell')
    #print(input$cell)
    
    cell <- input$cell
    
    if (any(grepl("ccf",cell,ignore.case=TRUE) == T)){
      cell <- c(cell, unlist(unname(ccf.cellline)))
    }
    if (any(input$cell == "all")){
      cell <- cellline.name
    }
    if (any(input$cell == "all")){
      cell <- cellline.name }
    if (any(input$cell == "Breast")){
      cell <- cellline2tissue[cellline2tissue$Tissue %in% c("Breast"),]$Cell_Line_Name }
    if (any(input$cell == "Melanoma")){
      cell <- cellline2tissue[cellline2tissue$Tissue %in% c("Melanoma"),]$Cell_Line_Name }
    if (any(input$cell == "CNS")){
      cell <- cellline2tissue[cellline2tissue$Tissue %in% c("CNS"),]$Cell_Line_Name }
    if (any(input$cell == "NSCL")){
      cell <- cellline2tissue[cellline2tissue$Tissue %in% c("NSCL"),]$Cell_Line_Name } 
    if (any(input$cell == "Colon")){
      cell <- cellline2tissue[cellline2tissue$Tissue %in% c("Colon"),]$Cell_Line_Name }
    if (any(input$cell == "Ovarian")){
      cell <- cellline2tissue[cellline2tissue$Tissue %in% c("Ovarian"),]$Cell_Line_Name }  
    if (any(input$cell == "Leukemia")){
      cell <- cellline2tissue[cellline2tissue$Tissue %in% c("Leukemia"),]$Cell_Line_Name }        
    if (any(input$cell == "Renal")){
      cell <- cellline2tissue[cellline2tissue$Tissue %in% c("Renal"),]$Cell_Line_Name }        
    if (any(input$cell == "Prostate")){
      cell <- cellline2tissue[cellline2tissue$Tissue %in% c("Prostate"),]$Cell_Line_Name }
    
    print('cell')
    print(cell)   
    
    plot.data <- protein.data[protein.data$`Protein.ID` %in% protein, colnames(protein.data) %in% cell]
    print("colnames")
    print(colnames(plot.data))
    rownames(plot.data) <- protein.data$`Protein.ID`[protein.data$`Protein.ID` %in% protein]
    plot.data[is.na(plot.data)] <- 0
    plot.data <- log(plot.data+1,2)
    #print(input$n[1])
    
    num_labels <- 25
    
    p <- pheatmap(plot.data, 
                  breaks = c(0,log(input$n[1] + 1,2),log(50, 2),max(plot.data)),
                  show_rownames = nrow(plot.data) < num_labels,
                  color = c("#E8EEF6", "#A2BADA","#4575B4", "#4575B4"))
  })
  
  
  output$min.text <- renderUI({
    selected_cell_lines <- min.TPM()
    HTML(paste("These", 
               length(global_selected_cells), 
               "cell lines,<pre>    ",
               paste(global_selected_cells, collapse = ", "), 
              "</pre>collectively cover these ", length(global_covered_genes),
              " proteins based on the provided cutoffs.<pre>", 
              paste(global_covered_genes, collapse = ", "),
              "</pre>"))
  })
  

}

shinyApp(ui, server)

