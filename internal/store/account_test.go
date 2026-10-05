package store

import "testing"

func TestUpdateAccountKeepsPasswordLogin(t *testing.T) {
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SetPassword("lumen-test-1"); err != nil {
		t.Fatal(err)
	}
	if s.Username() != "admin" {
		t.Fatalf("default username %s", s.Username())
	}
	tok, err := s.Login("lumen-test-1", true)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.UpdateAccount(tok, "nope", "nas", ""); err == nil {
		t.Fatal("wrong current password should fail")
	}
	if err := s.UpdateAccount(tok, "lumen-test-1", "nas", "short"); err == nil {
		t.Fatal("short password should fail")
	}
	if err := s.UpdateAccount(tok, "lumen-test-1", "nas", ""); err != nil {
		t.Fatal(err)
	}
	if s.Username() != "nas" {
		t.Fatalf("username %s", s.Username())
	}
	if !s.Valid(tok) {
		t.Fatal("current session should stay signed in")
	}
	if _, err := s.Login("lumen-test-1", false); err != nil {
		t.Fatal(err)
	}
	if err := s.UpdateAccount(tok, "lumen-test-1", "管家", "lumen-test-22"); err != nil {
		t.Fatal(err)
	}
	if s.Username() != "管家" {
		t.Fatalf("username %s", s.Username())
	}
	if _, err := s.Login("lumen-test-1", false); err == nil {
		t.Fatal("old password should stop working")
	}
	if _, err := s.Login("lumen-test-22", false); err != nil {
		t.Fatal(err)
	}
	s.mu.Lock()
	if len(s.state.Sessions) != 0 {
		t.Fatalf("remembered sessions = %d", len(s.state.Sessions))
	}
	s.mu.Unlock()
}

func TestNormalizeLayout(t *testing.T) {
	out := NormalizeLayout(HomeLayout{
		Groups: []HomeGroup{{ID: "g1", Name: "媒体"}, {ID: UngroupedID, Name: "别的"}, {ID: "g2", Name: "媒体"}},
		Order: map[string][]string{
			"g1":        {"a", "a", "b"},
			UngroupedID: {"b", "c"},
			"missing":   {"z"},
		},
		Span: map[string]int{"a": 9, "b": 0, "c": 2},
	})
	if out.Groups[0].ID != UngroupedID || out.Groups[0].Name != "未分组" {
		t.Fatalf("ungrouped %+v", out.Groups[0])
	}
	if len(out.Groups) != 2 || out.Groups[1].Name != "媒体" {
		t.Fatalf("groups %+v", out.Groups)
	}
	if len(out.Order["g1"]) != 1 || out.Order["g1"][0] != "a" {
		t.Fatalf("g1 order %+v", out.Order["g1"])
	}
	if len(out.Order[UngroupedID]) != 2 || out.Order[UngroupedID][0] != "b" || out.Order[UngroupedID][1] != "c" {
		t.Fatalf("ungrouped order %+v", out.Order[UngroupedID])
	}
	if out.Span["a"] != 3 || out.Span["b"] != 1 || out.Span["c"] != 2 {
		t.Fatalf("span %+v", out.Span)
	}
	if _, ok := out.Order["missing"]; ok {
		t.Fatal("unknown group should be dropped")
	}
}
