FROM golang:1.26 AS builder

WORKDIR /app

RUN apt-get update && apt-get install build-essential -y

COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY . .
RUN sed -i "s/sqlite3.h/sqlite3-binding.h/g" \
  /go/pkg/mod/github.com/asg017/sqlite-vec-go-bindings@v0.1.6/cgo/sqlite-vec.h \
  /go/pkg/mod/github.com/asg017/sqlite-vec-go-bindings@v0.1.6/cgo/sqlite-vec.c

RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 CGO_CFLAGS="-I$(go env GOMODCACHE)/github.com/mattn/go-sqlite3@$(go list -m -f '{{.Version}}' github.com/mattn/go-sqlite3)" go build --tags "fts5" -o server .

FROM gcr.io/distroless/base-debian12

COPY --from=builder /app/server /

CMD ["/server"]
