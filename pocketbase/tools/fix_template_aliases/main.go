package main

import (
	"bufio"
	"fmt"
	"os"
	"regexp"
	"strings"
	"unicode"
)

var (
	selectLineRe = regexp.MustCompile(`^\s*//\s*select:`)
	optionLineRe = regexp.MustCompile(`^(\s*)//\s*-\s*(.+?)\s*$`)
	aliasLineRe  = regexp.MustCompile(`^\s*//\s*>\s*(.+?)\s*$`)
)

var goKeywords = map[string]struct{}{
	"break": {}, "default": {}, "func": {}, "interface": {}, "select": {},
	"case": {}, "defer": {}, "go": {}, "map": {}, "struct": {},
	"chan": {}, "else": {}, "goto": {}, "package": {}, "switch": {},
	"const": {}, "fallthrough": {}, "if": {}, "range": {}, "type": {},
	"continue": {}, "for": {}, "import": {}, "return": {}, "var": {},
}

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: go run ./tools/fix_template_aliases <template-file>")
		os.Exit(2)
	}

	path := os.Args[1]
	f, err := os.Open(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to open template: %v\n", err)
		os.Exit(1)
	}
	defer f.Close()

	var lines []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "failed reading template: %v\n", err)
		os.Exit(1)
	}

	out := make([]string, 0, len(lines)+32)
	inserted := 0
	seenInSelect := map[string]struct{}{}

	for i := 0; i < len(lines); i++ {
		line := lines[i]
		out = append(out, line)

		if selectLineRe.MatchString(line) {
			seenInSelect = map[string]struct{}{}
			continue
		}

		m := optionLineRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}

		indent := m[1]
		option := strings.TrimSpace(m[2])

		if i+1 < len(lines) {
			next := strings.TrimSpace(lines[i+1])
			if aliasLineRe.MatchString(next) {
				alias := aliasLineRe.FindStringSubmatch(next)[1]
				seenInSelect[alias] = struct{}{}
				continue
			}
		}

		if isValidGoIdent(option) {
			seenInSelect[option] = struct{}{}
			continue
		}

		alias := makeAlias(option)
		for {
			if _, exists := seenInSelect[alias]; !exists {
				break
			}
			alias += "X"
		}
		seenInSelect[alias] = struct{}{}

		out = append(out, indent+"// > "+alias)
		inserted++
	}

	content := strings.Join(out, "\n") + "\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		fmt.Fprintf(os.Stderr, "failed writing template: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("fixed template aliases: inserted %d alias lines\n", inserted)
}

func isValidGoIdent(s string) bool {
	if s == "" {
		return false
	}
	if _, isKeyword := goKeywords[s]; isKeyword {
		return false
	}

	for i, r := range s {
		if i == 0 {
			if !unicode.IsLetter(r) && r != '_' {
				return false
			}
			continue
		}
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) && r != '_' {
			return false
		}
	}

	return true
}

func makeAlias(option string) string {
	parts := strings.FieldsFunc(option, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	if len(parts) == 0 {
		return "Value"
	}

	var b strings.Builder
	for _, part := range parts {
		if part == "" {
			continue
		}
		runes := []rune(strings.ToLower(part))
		runes[0] = unicode.ToUpper(runes[0])
		b.WriteString(string(runes))
	}

	alias := b.String()
	if alias == "" {
		alias = "Value"
	}
	if !isValidGoIdent(alias) {
		alias = "Value" + alias
	}
	if _, isKeyword := goKeywords[alias]; isKeyword {
		alias += "Value"
	}

	return alias
}
