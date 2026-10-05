package store

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type IconRef struct {
	Source string `json:"source"`
	Slug   string `json:"slug,omitempty"`
	URL    string `json:"url,omitempty"`
}

type Meta struct {
	DisplayName  string   `json:"displayName,omitempty"`
	Group        string   `json:"group,omitempty"`
	WebURL       string   `json:"webUrl,omitempty"`
	Description  string   `json:"description,omitempty"`
	IconOverride *IconRef `json:"iconOverride,omitempty"`
	HideOnHome   bool     `json:"hideOnHome,omitempty"`
}

type remembered struct {
	Hash    string `json:"hash"`
	Expires int64  `json:"expires"`
}

type Channel struct {
	ID       string            `json:"id"`
	Type     string            `json:"type"`
	Name     string            `json:"name"`
	Enabled  bool              `json:"enabled"`
	Config   map[string]string `json:"config"`
	LastTest *TestResult       `json:"lastTest,omitempty"`
}

type TestResult struct {
	OK  bool   `json:"ok"`
	At  string `json:"at"`
	Msg string `json:"msg,omitempty"`
}

type AlertRule struct {
	ID        string   `json:"id"`
	Kind      string   `json:"kind"`
	Name      string   `json:"name"`
	Enabled   bool     `json:"enabled"`
	Target    string   `json:"target"`
	Threshold float64  `json:"threshold,omitempty"`
	Duration  string   `json:"duration,omitempty"`
	Channels  []string `json:"channels"`
	Cooldown  string   `json:"cooldown"`
	Resolve   bool     `json:"resolve,omitempty"`
}

type Sent struct {
	Channel string `json:"channel"`
	OK      bool   `json:"ok"`
}

type AlertEvent struct {
	ID         string `json:"id"`
	At         string `json:"at"`
	RuleID     string `json:"ruleId"`
	Severity   string `json:"severity"`
	Title      string `json:"title"`
	Detail     string `json:"detail"`
	State      string `json:"state"`
	ResolvedAt string `json:"resolvedAt,omitempty"`
	Sent       []Sent `json:"sent"`
}

type UpdateRow struct {
	ServiceIDs  []string `json:"serviceIds"`
	Stack       string   `json:"stack,omitempty"`
	Image       string   `json:"image"`
	Current     string   `json:"current"`
	Latest      string   `json:"latest"`
	Published   string   `json:"published"`
	SizeDeltaMB float64  `json:"sizeDeltaMB"`
	Pinned      bool     `json:"pinned,omitempty"`
}

type fileState struct {
	PasswordHash  string          `json:"passwordHash"`
	Sessions      []remembered    `json:"sessions"`
	Meta          map[string]Meta `json:"meta"`
	HomeOrder     []string        `json:"homeOrder,omitempty"`
	Channels      []Channel       `json:"channels,omitempty"`
	Rules         []AlertRule     `json:"rules,omitempty"`
	Events        []AlertEvent    `json:"events,omitempty"`
	Updates       []UpdateRow     `json:"updates,omitempty"`
	UpdateChecked string          `json:"updateChecked,omitempty"`
	UpdateError   string          `json:"updateError,omitempty"`
}

type Session struct {
	Token    string
	Expires  time.Time
	Remember bool
}

type Store struct {
	mu       sync.Mutex
	path     string
	state    fileState
	memory   map[string]time.Time
	fails    int
	lockedTo time.Time
}

func Open(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	s := &Store{
		path:   filepath.Join(dir, "state.json"),
		memory: map[string]time.Time{},
		state:  fileState{Meta: map[string]Meta{}},
	}
	b, err := os.ReadFile(s.path)
	if err == nil {
		if err := json.Unmarshal(b, &s.state); err != nil {
			return nil, err
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if s.state.Meta == nil {
		s.state.Meta = map[string]Meta{}
	}
	if s.state.Channels == nil {
		s.state.Channels = []Channel{}
	}
	if s.state.Rules == nil {
		s.state.Rules = []AlertRule{}
	}
	if s.state.Events == nil {
		s.state.Events = []AlertEvent{}
	}
	if s.state.Updates == nil {
		s.state.Updates = []UpdateRow{}
	}
	if s.state.HomeOrder == nil {
		s.state.HomeOrder = []string{}
	}
	now := time.Now().Unix()
	kept := s.state.Sessions[:0]
	for _, ses := range s.state.Sessions {
		if ses.Expires > now {
			kept = append(kept, ses)
		}
	}
	s.state.Sessions = kept
	return s, nil
}

func (s *Store) saveLocked() error {
	b, err := json.MarshalIndent(s.state, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

func (s *Store) SetupRequired() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state.PasswordHash == ""
}

func (s *Store) ResetPassword() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state.PasswordHash = ""
	s.state.Sessions = nil
	s.memory = map[string]time.Time{}
	s.fails = 0
	return s.saveLocked()
}

func (s *Store) SetPassword(pw string) error {
	if len(pw) < 10 {
		return errors.New("密码至少 10 位")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state.PasswordHash = string(hash)
	s.fails = 0
	return s.saveLocked()
}

func (s *Store) Login(pw string, remember bool) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.state.PasswordHash == "" {
		return "", errors.New("尚未设置密码")
	}
	if time.Now().Before(s.lockedTo) {
		return "", errors.New("登录已锁定，请 15 分钟后再试")
	}
	if bcrypt.CompareHashAndPassword([]byte(s.state.PasswordHash), []byte(pw)) != nil {
		s.fails++
		left := 5 - s.fails
		if s.fails >= 5 {
			s.lockedTo = time.Now().Add(15 * time.Minute)
			s.fails = 0
			return "", errors.New("密码错误次数过多，已锁定 15 分钟")
		}
		if left < 0 {
			left = 0
		}
		return "", errors.New("密码错误，还可以尝试 " + itoa(left) + " 次，之后锁定 15 分钟")
	}
	s.fails = 0
	token, err := newToken()
	if err != nil {
		return "", err
	}
	exp := time.Now().Add(12 * time.Hour)
	if remember {
		exp = time.Now().Add(7 * 24 * time.Hour)
		s.state.Sessions = append(s.state.Sessions, remembered{
			Hash:    hashToken(token),
			Expires: exp.Unix(),
		})
		if err := s.saveLocked(); err != nil {
			return "", err
		}
	}
	s.memory[token] = exp
	return token, nil
}

func (s *Store) Logout(token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.memory, token)
	h := hashToken(token)
	kept := s.state.Sessions[:0]
	for _, ses := range s.state.Sessions {
		if ses.Hash != h {
			kept = append(kept, ses)
		}
	}
	s.state.Sessions = kept
	_ = s.saveLocked()
}

func (s *Store) Valid(token string) bool {
	if token == "" {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if exp, ok := s.memory[token]; ok && time.Now().Before(exp) {
		return true
	}
	h := hashToken(token)
	now := time.Now().Unix()
	for _, ses := range s.state.Sessions {
		if ses.Hash == h && ses.Expires > now {
			s.memory[token] = time.Unix(ses.Expires, 0)
			return true
		}
	}
	return false
}

func (s *Store) Meta(id string) Meta {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state.Meta[id]
}

func (s *Store) AllMeta() map[string]Meta {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make(map[string]Meta, len(s.state.Meta))
	for k, v := range s.state.Meta {
		out[k] = v
	}
	return out
}

func (s *Store) PutMeta(id string, m Meta) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state.Meta[id] = m
	return s.saveLocked()
}

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [8]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}
