FROM --platform=linux/amd64 golang:1.24 AS builder

WORKDIR /app

RUN apt-get update && apt-get install build-essential -y

COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY . .
RUN sed -i "s/sqlite3.h/sqlite3-binding.h/g" \
  /go/pkg/mod/github.com/asg017/sqlite-vec-go-bindings@v0.1.6/cgo/sqlite-vec.h \
  /go/pkg/mod/github.com/asg017/sqlite-vec-go-bindings@v0.1.6/cgo/sqlite-vec.c

# Build with CGO enabled for linux/amd64
RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 CGO_CFLAGS="-I/go/pkg/mod/github.com/mattn/go-sqlite3@v1.14.34" go build --tags "fts5" -o server .

FROM --platform=linux/amd64 gcr.io/distroless/base-debian12

COPY --from=builder /app/server /

CMD ["/server"]
