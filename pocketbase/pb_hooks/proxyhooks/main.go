package proxyhooks

import (
	"sync"

	pbgen "github.com/lsherman98/libgraph/pocketbase/pbschema/generated"
	"github.com/pocketbase/pocketbase/core"
)

var (
	proxyHooksOnce sync.Once
	proxyHooks     *pbgen.ProxyHooks
)

func Get(app core.App) *pbgen.ProxyHooks {
	proxyHooksOnce.Do(func() {
		proxyHooks = pbgen.NewProxyHooks(app)
	})

	return proxyHooks
}
