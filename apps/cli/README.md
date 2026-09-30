# Otter Drive CLI

```bash
npm install --global otterdrive
otterdrive auth login
otterdrive artifacts --help
```

Publish a website directory or a single Markdown, CSV, TSV, or Excel workbook file. Otter Drive detects the entry file and the web app provides a dedicated document preview:

```bash
otterdrive artifacts create ./report.xlsx \
  --slug quarterly-report \
  --title "Quarterly report"
```

See the repository README for authentication, organizations, artifact commands, and self-hosting instructions.
