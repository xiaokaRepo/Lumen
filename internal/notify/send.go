package notify

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/xiaokaRepo/lumen/internal/store"
)

var client = &http.Client{Timeout: 12 * time.Second}

func Send(ch store.Channel, title, body string) error {
	switch ch.Type {
	case "bark":
		return sendBark(ch.Config, title, body)
	case "telegram":
		return sendTelegram(ch.Config, title, body)
	case "wecom":
		return sendWeCom(ch.Config, title, body)
	default:
		return fmt.Errorf("未知渠道 %s", ch.Type)
	}
}

func sendBark(cfg map[string]string, title, body string) error {
	server := strings.TrimRight(cfg["server"], "/")
	if server == "" {
		server = "https://api.day.app"
	}
	key := strings.TrimSpace(cfg["key"])
	if key == "" {
		return fmt.Errorf("缺少 Bark 设备 Key")
	}
	u := server + "/" + url.PathEscape(key) + "/" + url.PathEscape(title) + "/" + url.PathEscape(body)
	q := url.Values{}
	if cfg["group"] != "" {
		q.Set("group", cfg["group"])
	}
	if cfg["level"] != "" {
		q.Set("level", cfg["level"])
	}
	if enc := q.Encode(); enc != "" {
		u += "?" + enc
	}
	res, err := client.Get(u)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	return readOK(res)
}

func sendTelegram(cfg map[string]string, title, body string) error {
	token := strings.TrimSpace(cfg["token"])
	chat := strings.TrimSpace(cfg["chatId"])
	if token == "" || chat == "" {
		return fmt.Errorf("缺少 Bot Token 或 Chat ID")
	}
	if cfg["proxy"] != "" {
		return fmt.Errorf("暂不支持在面板里配置 Telegram 代理，请让主机能直接访问 api.telegram.org")
	}
	payload, _ := json.Marshal(map[string]string{
		"chat_id": chat,
		"text":    title + "\n" + body,
	})
	res, err := client.Post("https://api.telegram.org/bot"+token+"/sendMessage", "application/json", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	defer res.Body.Close()
	return readOK(res)
}

func sendWeCom(cfg map[string]string, title, body string) error {
	hook := strings.TrimSpace(cfg["webhook"])
	if hook == "" {
		return fmt.Errorf("缺少企业微信 Webhook")
	}
	text := title + "\n" + body
	if m := strings.TrimSpace(cfg["mention"]); m != "" {
		text += "\n" + m
	}
	payload, _ := json.Marshal(map[string]any{
		"msgtype": "text",
		"text":    map[string]string{"content": text},
	})
	res, err := client.Post(hook, "application/json", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	defer res.Body.Close()
	return readOK(res)
}

func readOK(res *http.Response) error {
	b, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
	if res.StatusCode >= 300 {
		msg := strings.TrimSpace(string(b))
		if msg == "" {
			msg = res.Status
		}
		return fmt.Errorf("通知接口返回 %s", msg)
	}
	return nil
}
