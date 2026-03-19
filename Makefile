.PHONY: pb build deploy dev migrate sync types 

pb:
	cd pocketbase && go run --tags "fts5" . serve --dev

build:
	pnpm build
	cd pocketbase && go build -o server --tags "fts5" .

deploy: 
	cd pocketbase && ./deploy.sh

dev: 
	pnpm dev

migrate: 
	cd pocketbase && go run . migrate collections

sync: 
	cd pocketbase && go run . migrate history-sync

types: 
	pnpm pb:typegen