# PocketBase Go schema types

This package contains generated type-safe PocketBase record proxies for the Go backend.

## Files

- `template.go` - editable schema template produced by `pocketbase-gogen template`
- `generated/proxies.go` - generated proxies (do not edit)
- `generated/utils.go` - generated helpers (do not edit)

## Generate workflow

From the repo root:

```bash
make pb-go-template   # refresh template from ./pocketbase/pb_data
make pb-go-types      # generate proxies from template
```

Or just regenerate proxies from the current template:

```bash
make pb-go-typegen
```

## Notes

- `template.go` is intentionally editable and may contain custom aliases/comments needed for valid Go generation.
- In this repo, `processing_jobs.job_type` select options use aliases because the raw option values include dots (for example `upload.parse_or_transcribe`).
- Re-running `make pb-go-template` will overwrite manual aliases in `template.go`; re-apply them before running `make pb-go-types`.
