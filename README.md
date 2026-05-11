# Libgraph

This project consists of a React frontend and a PocketBase (Go) backend.

## Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/)
- [pnpm](https://pnpm.io/)
- [Go](https://go.dev/)

## Installation

1. Install the frontend dependencies:
   ```bash
   pnpm install
   ```

## Backend Environment Variables (PocketBase)


Required for startup:
- `GEMINI_API_KEY`: Google Gemini API key used by chat, embeddings, and summarization hooks.

Optional with defaults:
- `PROCESSING_PARSE_WORKERS`: Worker count for parse/transcribe jobs. Defaults to `1`.
- `PROCESSING_CHUNK_WORKERS`: Worker count for chunk generation jobs. Defaults to `1`.
- `PROCESSING_SUMMARIZE_WORKERS`: Worker count for summarize jobs. Defaults to `1`.

Optional by feature:
- `MISTRAL_API_KEY`: Required only if you use audio transcription.

## Running the Project Locally

You will need to run both the frontend and the backend servers simultaneously. You can use two separate terminal windows for this.

### 1. Start the PocketBase Backend

Run the following command to start the PocketBase server:

```bash
make pb
```

The backend will be available at `http://localhost:8090`. You can access the admin UI at `http://localhost:8090/_/`.

### 2. Start the Frontend Development Server

In a new terminal window, run the following command:

```bash
make dev
```

## Other Commands

- `make build`: Builds the frontend and compiles the Go backend.
- `make types`: Generates PocketBase TypeScript definitions.
