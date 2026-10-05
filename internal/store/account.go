package store

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

func (s *Store) Username() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	name := strings.TrimSpace(s.state.Username)
	if name == "" {
		return "admin"
	}
	return name
}

// UpdateAccount changes the single admin's display name and, when newPassword
// is set, the password. Login stays password-only. Remembered sessions on
// other devices are cleared. The session that sent token stays signed in.
func (s *Store) UpdateAccount(token, current, username, newPassword string) error {
	username = strings.TrimSpace(username)
	if username == "" {
		return errors.New("请填写用户名")
	}
	if n := utf8.RuneCountInString(username); n < 1 || n > 32 {
		return errors.New("用户名需要 1 到 32 个字符")
	}
	if strings.ContainsAny(username, "\n\r\t") {
		return errors.New("用户名不能包含换行")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.state.PasswordHash == "" {
		return errors.New("尚未设置密码")
	}
	if bcrypt.CompareHashAndPassword([]byte(s.state.PasswordHash), []byte(current)) != nil {
		return errors.New("当前密码不正确")
	}
	if newPassword != "" {
		if len(newPassword) < 10 {
			return errors.New("密码至少 10 位")
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		s.state.PasswordHash = string(hash)
	}
	s.state.Username = username
	s.state.Sessions = nil
	kept := map[string]time.Time{}
	if token != "" {
		if exp, ok := s.memory[token]; ok && time.Now().Before(exp) {
			kept[token] = exp
		}
	}
	s.memory = kept
	s.fails = 0
	return s.saveLocked()
}
