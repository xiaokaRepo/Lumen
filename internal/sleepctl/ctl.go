package sleepctl

import (
	"sync"

	"github.com/xiaokaRepo/lumen/internal/alerteng"
	"github.com/xiaokaRepo/lumen/internal/dockermgr"
	"github.com/xiaokaRepo/lumen/internal/metrics"
	"github.com/xiaokaRepo/lumen/internal/store"
)

type gate struct {
	done chan struct{}
	err  error
}

// Ctl stops containers to free memory and listens on the single web port.
type Ctl struct {
	store  *store.Store
	docker *dockermgr.Manager
	hist   *metrics.History
	alerts *alerteng.Engine

	mu      sync.Mutex
	proxies map[string]*proxy
	holds   map[string]int
	gates   map[string]*gate
}
