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
