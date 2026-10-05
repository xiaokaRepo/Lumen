package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/xiaokaRepo/lumen/internal/dockermgr"
	"github.com/xiaokaRepo/lumen/internal/hoststat"
	"github.com/xiaokaRepo/lumen/internal/httpapi"
	"github.com/xiaokaRepo/lumen/internal/store"
)

func main() {
	data := getenv("LUMEN_DATA", "data")
	addr := getenv("LUMEN_ADDR", ":7878")
	st, err := store.Open(data)
	if err != nil {
		log.Fatal(err)
	}
	if len(os.Args) > 1 && os.Args[1] == "reset-password" {
		if err := st.ResetPassword(); err != nil {
			log.Fatal(err)
		}
		log.Print("密码已清除，下次打开面板会进入设置密码")
		return
	}
	host := hoststat.New()
	docker, err := dockermgr.New(st, func() string { return host.Current().IP })
	if err != nil {
		log.Fatal(err)
	}
	srv := &httpapi.Server{
		Store:  st,
		Host:   host,
		Docker: docker,
		Static: os.Getenv("LUMEN_STATIC"),
	}
	httpSrv := &http.Server{
		Addr:              addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("Lumen listening on %s", addr)
	log.Fatal(httpSrv.ListenAndServe())
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
