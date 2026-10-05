package store

import (
	"crypto/subtle"
	"errors"
	"net/url"
	"strings"
)

// Agent is one lumen-agent the panel can talk to.
type Agent struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	URL   string `json:"url,omitempty"`
	Token string `json:"token"`
}

func (s *Store) Agents() []Agent {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.state.Agents) == 0 {
		return []Agent{}
	}
	return append([]Agent{}, s.state.Agents...)
}

func (s *Store) ActiveAgent() (Agent, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.activeLocked()
}

func (s *Store) activeLocked() (Agent, bool) {
	if s.state.ActiveAgent == "" {
		return Agent{}, false
	}
	for _, a := range s.state.Agents {
		if a.ID == s.state.ActiveAgent {
			return a, true
		}
	}
	return Agent{}, false
}

func (s *Store) AgentByToken(token string) (Agent, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var found Agent
	ok := false
	for _, a := range s.state.Agents {
		if subtle.ConstantTimeCompare([]byte(a.Token), []byte(token)) == 1 {
			found = a
			ok = true
		}
	}
	return found, ok
}

func (s *Store) PutAgent(in Agent) (Agent, error) {
	in.Name = strings.TrimSpace(in.Name)
	in.Token = strings.TrimSpace(in.Token)
	if in.Name == "" {
		return Agent{}, errors.New("名称不能为空")
	}
	if len(in.Token) < 8 {
		return Agent{}, errors.New("令牌至少 8 位")
	}
	cleaned, err := cleanAgentURL(in.URL)
	if err != nil {
		return Agent{}, err
	}
	in.URL = cleaned
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, a := range s.state.Agents {
		if a.ID != in.ID && subtle.ConstantTimeCompare([]byte(a.Token), []byte(in.Token)) == 1 {
			return Agent{}, errors.New("这个令牌已经用在另一台主机上")
		}
	}
	if in.ID == "" {
		in.ID = newID()
		if len(s.state.Agents) == 0 && len(s.state.HomeOrder) > 0 {
			if s.state.HomeOrders == nil {
				s.state.HomeOrders = map[string][]string{}
			}
			s.state.HomeOrders[in.ID] = append([]string{}, s.state.HomeOrder...)
		}
		s.state.Agents = append(s.state.Agents, in)
		if s.state.ActiveAgent == "" {
			s.state.ActiveAgent = in.ID
		}
	} else {
		found := false
		for i := range s.state.Agents {
			if s.state.Agents[i].ID == in.ID {
				s.state.Agents[i] = in
				found = true
				break
			}
		}
		if !found {
			return Agent{}, errors.New("找不到这台主机")
		}
	}
	if err := s.saveLocked(); err != nil {
		return Agent{}, err
	}
	return in, nil
}

func (s *Store) DeleteAgent(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := s.state.Agents[:0]
	found := false
	for _, a := range s.state.Agents {
		if a.ID == id {
			found = true
			continue
		}
		next = append(next, a)
	}
	if !found {
		return errors.New("找不到这台主机")
	}
	s.state.Agents = next
	delete(s.state.HomeOrders, id)
	if s.state.ActiveAgent == id {
		s.state.ActiveAgent = ""
		if len(next) > 0 {
			s.state.ActiveAgent = next[0].ID
		}
	}
	return s.saveLocked()
}

func (s *Store) SetActiveAgent(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	found := false
	for _, a := range s.state.Agents {
		if a.ID == id {
			found = true
			break
		}
	}
	if !found {
		return errors.New("找不到这台主机")
	}
	s.state.ActiveAgent = id
	return s.saveLocked()
}

func cleanAgentURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return "", errors.New("地址需要写成 http://主机:7879")
	}
	u.Path = ""
	u.RawQuery = ""
	u.Fragment = ""
	return u.String(), nil
}
