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
	if len(s.state.HomeOrder) == 0 {
		return []string{}
	}
	return append([]string{}, s.state.HomeOrder...)
}

func (s *Store) SetHomeOrder(ids []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state.HomeOrder = append([]string(nil), ids...)
	return s.saveLocked()
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
