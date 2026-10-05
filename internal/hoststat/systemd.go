package hoststat

import (
	"os/exec"
	"strings"
)

type Unit struct {
	Name        string `json:"name"`
	Load        string `json:"load"`
	Active      string `json:"active"`
	Sub         string `json:"sub"`
	Description string `json:"description"`
}

func SystemdAction(name, action string) error {
	switch action {
	case "start", "stop", "restart":
	default:
		return actionFail("不支持这个操作")
	}
	if !strings.HasSuffix(name, ".service") {
		name += ".service"
	}
	out, err := exec.Command("systemctl", action, name).CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = "systemctl " + action + " 失败"
		}
		return actionFail(msg)
	}
	return nil
}

type actionFail string

func (e actionFail) Error() string { return string(e) }

func SystemdUnits() ([]Unit, string) {
	out, err := exec.Command("systemctl", "list-units", "--type=service", "--all", "--no-legend", "--plain", "--no-pager").Output()
	if err != nil {
		return []Unit{}, "这台机器没有以 systemd 作为 init，读不到单元列表"
	}
	var units []Unit
	for _, line := range strings.Split(string(out), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		desc := ""
		if len(fields) > 4 {
			desc = strings.Join(fields[4:], " ")
		}
		units = append(units, Unit{
			Name:        fields[0],
			Load:        fields[1],
			Active:      fields[2],
			Sub:         fields[3],
			Description: desc,
		})
	}
	if units == nil {
		units = []Unit{}
	}
	return units, ""
}
