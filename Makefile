.PHONY: pb build deploy dev migrate sync types pb-go-template pb-go-template-fix pb-go-refresh pb-go-types pb-go-typegen

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
	cd pocketbase && go run github.com/snonky/pocketbase-gogen@latest template ./pb_data ./pbschema/template.go && go run ./tools/fix_template_aliases ./pbschema/template.go && go run github.com/snonky/pocketbase-gogen@latest generate ./pbschema/template.go ./pbschema/generated/proxies.go --utils --hooks