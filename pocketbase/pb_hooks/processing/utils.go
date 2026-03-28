package processing

import (
	"os"
	"strconv"
)

func getWorkerCount(name string) int {
	count, _ := strconv.Atoi(os.Getenv(name))
	return count
}
