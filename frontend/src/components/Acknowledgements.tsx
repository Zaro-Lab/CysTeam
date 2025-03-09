import { Box, Typography } from "@mui/material";

const AcknowledgementsBox = () => {
  return (
    <Box
      sx={{
        mt: 3,
        p: 3,
        borderRadius: 2,
        background:
          "linear-gradient(145deg, rgba(37,99,235,0.08) 0%, rgba(124,58,237,0.08) 100%)",
        border: "1px solid rgba(124,58,237,0.2)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
      }}
    >
      <Typography
        variant="subtitle1"
        fontWeight={600}
        sx={{ mb: 1, color: "secondary.dark" }}
      >
        Acknowledgements
      </Typography>
      <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
        CSEA was developed by the{" "}
        <a
          href="https://www.barpeledlab.org"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "#5b21b6",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Bar-Peled Lab
        </a>{" "}
        as part of{" "}
        <a
          href="https://www.cell.com/cell/fulltext/S0092-8674(24)00318-0#sec-4"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "#5b21b6",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          DrugMap
        </a>{" "}
        and the original code is{" "}
        <a
          href="https://github.com/bplab-compbio/DrugMap/tree/main/CSEA"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "#5b21b6",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          publicly available on GitHub
        </a>
        . CSEA was adapted as an online tool by the{" "}
        <a
          href="https://pharm.ucsf.edu/zaro"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "#5b21b6",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Zaro Lab
        </a>{" "}
        and the code for this version of the tool will be available on our{" "}
        <a
          href="https://github.com/Zaro-Lab"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "#5b21b6",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          GitHub.
        </a>
      </Typography>
    </Box>
  );
};

export default AcknowledgementsBox;
