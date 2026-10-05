package store

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
	"time"
)

func (s *Store) HomeOrder() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if id := s.state.ActiveAgent; id != "" {
		if s.state.HomeOrders != nil {
			if ids, ok := s.state.HomeOrders[id]; ok {
				return append([]string{}, ids...)
			}
		}
		return []string{}
	}
	if len(s.state.HomeOrder) == 0 {
		return []string{}
	}
	return append([]string{}, s.state.HomeOrder...)
}

func (s *Store) SetHomeOrder(ids []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if id := s.state.ActiveAgent; id != "" {
		if s.state.HomeOrders == nil {
			s.state.HomeOrders = map[string][]string{}
		}
		s.state.HomeOrders[id] = append([]string(nil), ids...)
		return s.saveLocked()
	}
	s.state.HomeOrder = append([]string(nil), ids...)
	return s.saveLocked()
}

// CardFields is which extra lines a homepage card shows. A missing value means all on.
type CardFields struct {
	Status bool `json:"status"`
	Usage  bool `json:"usage"`
	Uptime bool `json:"uptime"`
	Update bool `json:"update"`
}

func DefaultCardFields() CardFields {
	return CardFields{Status: true, Usage: true, Uptime: true, Update: true}
}

func (s *Store) CardFields() CardFields {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.state.CardFields == nil {
		return DefaultCardFields()
	}
	return *s.state.CardFields
}

func (s *Store) SetCardFields(f CardFields) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state.CardFields = &f
	return s.saveLocked()
}

const UngroupedID = "ungrouped"

// HomeGroup is one homepage section. The ungrouped group cannot be removed.
type HomeGroup struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// HomeLayout is the homepage grouping and card width for one agent.
type HomeLayout struct {
	Groups []HomeGroup         `json:"groups"`
	Order  map[string][]string `json:"order"`
	Span   map[string]int      `json:"span"`
}

func DefaultHomeLayout() HomeLayout {
	return NormalizeLayout(HomeLayout{})
}

func (s *Store) HomeLayout() HomeLayout {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.layoutLocked()
}

func (s *Store) layoutLocked() HomeLayout {
	var raw HomeLayout
	if id := s.state.ActiveAgent; id != "" {
		if s.state.HomeLayouts != nil {
			raw = s.state.HomeLayouts[id]
		}
	} else if s.state.HomeLayout != nil {
		raw = *s.state.HomeLayout
	}
	return NormalizeLayout(raw)
}

func (s *Store) SetHomeLayout(in HomeLayout) (HomeLayout, error) {
	next := NormalizeLayout(in)
	s.mu.Lock()
	defer s.mu.Unlock()
	if id := s.state.ActiveAgent; id != "" {
		if s.state.HomeLayouts == nil {
			s.state.HomeLayouts = map[string]HomeLayout{}
		}
		s.state.HomeLayouts[id] = next
	} else {
		s.state.HomeLayout = &next
	}
	if err := s.saveLocked(); err != nil {
		return HomeLayout{}, err
	}
	return next, nil
}

func NormalizeLayout(in HomeLayout) HomeLayout {
	groups := []HomeGroup{{ID: UngroupedID, Name: "未分组"}}
	seen := map[string]bool{UngroupedID: true}
	names := map[string]bool{"未分组": true}
	for _, g := range in.Groups {
		id := strings.TrimSpace(g.ID)
		name := strings.TrimSpace(g.Name)
		if id == "" || id == UngroupedID || seen[id] || name == "" || names[name] {
			continue
		}
		if utf8Len(name) > 24 {
			name = trimRunes(name, 24)
		}
		seen[id] = true
		names[name] = true
		groups = append(groups, HomeGroup{ID: id, Name: name})
	}
	order := map[string][]string{}
	used := map[string]bool{}
	for _, g := range groups {
		var ids []string
		for _, id := range in.Order[g.ID] {
			id = strings.TrimSpace(id)
			if id == "" || used[id] {
				continue
			}
			used[id] = true
			ids = append(ids, id)
		}
		if ids == nil {
			ids = []string{}
		}
		order[g.ID] = ids
	}
	span := map[string]int{}
	for id, n := range in.Span {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if n < 1 {
			n = 1
		}
		if n > 3 {
			n = 3
		}
		span[id] = n
	}
	return HomeLayout{Groups: groups, Order: order, Span: span}
}

func utf8Len(s string) int {
	n := 0
	for range s {
		n++
	}
	return n
}

func trimRunes(s string, n int) string {
	i := 0
	for idx := range s {
		if i == n {
			return s[:idx]
		}
		i++
	}
	return s
}

func (s *Store) Channels() []Channel {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.state.Channels) == 0 {
		return []Channel{}
	}
	return append([]Channel{}, s.state.Channels...)
}

func (s *Store) PutChannel(c Channel) (Channel, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if c.Config == nil {
		c.Config = map[string]string{}
	}
	if strings.TrimSpace(c.Name) == "" {
		c.Name = c.Type
	}
	if c.ID == "" {
		c.ID = newID()
		s.state.Channels = append(s.state.Channels, c)
	} else {
		found := false
		for i := range s.state.Channels {
			if s.state.Channels[i].ID == c.ID {
				if c.LastTest == nil {
					c.LastTest = s.state.Channels[i].LastTest
				}
				s.state.Channels[i] = c
				found = true
				break
			}
		}
		if !found {
			s.state.Channels = append(s.state.Channels, c)
		}
	}
	if err := s.saveLocked(); err != nil {
		return Channel{}, err
	}
	return c, nil
}

func (s *Store) DeleteChannel(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := s.state.Channels[:0]
	for _, c := range s.state.Channels {
		if c.ID != id {
			next = append(next, c)
		}
	}
	s.state.Channels = next
	return s.saveLocked()
}

func (s *Store) MarkTest(id string, ok bool, msg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.state.Channels {
		if s.state.Channels[i].ID == id {
			s.state.Channels[i].LastTest = &TestResult{OK: ok, At: stamp(), Msg: msg}
			_ = s.saveLocked()
			return
		}
	}
}

func (s *Store) Rules() []AlertRule {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.state.Rules) == 0 {
		return []AlertRule{}
	}
	return append([]AlertRule{}, s.state.Rules...)
}

func (s *Store) PutRule(r AlertRule) (AlertRule, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if r.Channels == nil {
		r.Channels = []string{}
	}
	if r.ID == "" {
		r.ID = newID()
		s.state.Rules = append(s.state.Rules, r)
	} else {
		found := false
		for i := range s.state.Rules {
			if s.state.Rules[i].ID == r.ID {
				s.state.Rules[i] = r
				found = true
				break
			}
		}
		if !found {
			s.state.Rules = append(s.state.Rules, r)
		}
	}
	if err := s.saveLocked(); err != nil {
		return AlertRule{}, err
	}
	return r, nil
}

func (s *Store) Events() []AlertEvent {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := append([]AlertEvent{}, s.state.Events...)
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out
}

func (s *Store) AddEvent(e AlertEvent) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if e.ID == "" {
		e.ID = newID()
	}
	if e.At == "" {
		e.At = stamp()
	}
	if e.Sent == nil {
		e.Sent = []Sent{}
	}
	s.state.Events = append(s.state.Events, e)
	if len(s.state.Events) > 200 {
		s.state.Events = s.state.Events[len(s.state.Events)-200:]
	}
	return s.saveLocked()
}

func (s *Store) Updates() ([]UpdateRow, string, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.state.Updates) == 0 {
		return []UpdateRow{}, s.state.UpdateChecked, s.state.UpdateError
	}
	return append([]UpdateRow{}, s.state.Updates...), s.state.UpdateChecked, s.state.UpdateError
}

func (s *Store) SetUpdates(rows []UpdateRow, errText string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if rows == nil {
		rows = []UpdateRow{}
	}
	s.state.Updates = rows
	s.state.UpdateChecked = stamp()
	s.state.UpdateError = errText
	return s.saveLocked()
}

func stamp() string {
	return time.Now().Format("01-02 15:04")
}

func newID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
