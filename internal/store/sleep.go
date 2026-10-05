package store

func (s *Store) SleepRecs() map[string]SleepRec {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make(map[string]SleepRec, len(s.state.Sleep))
	for k, v := range s.state.Sleep {
		out[k] = v
	}
	return out
}

func (s *Store) SleepRec(id string) (SleepRec, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	rec, ok := s.state.Sleep[id]
	return rec, ok
}

func (s *Store) PutSleep(id string, rec SleepRec) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.state.Sleep == nil {
		s.state.Sleep = map[string]SleepRec{}
	}
	s.state.Sleep[id] = rec
	return s.saveLocked()
}

func (s *Store) ForgetSleep(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.state.Sleep[id]; !ok {
		return nil
	}
	delete(s.state.Sleep, id)
	return s.saveLocked()
}
