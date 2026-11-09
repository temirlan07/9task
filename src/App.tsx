import { useState, useEffect, type FormEvent } from 'react';
import './App.css';

const API_BASE_URL = 'https://inai-col3.fishrungames.com';

const ENDPOINTS = {
  login: `${API_BASE_URL}/api/login/`,
  logout: `${API_BASE_URL}/api/logout/`,
  register: `${API_BASE_URL}/api/register/`,
  profile: `${API_BASE_URL}/api/profile/`,
  specializations: `${API_BASE_URL}/api/specializations/`,
  refreshToken: `${API_BASE_URL}/api/token/refresh/`,
};

interface SpecOption {
  value: string;
  label: string;
}

interface MusicianData {
  id?: number;
  username: string;
  email?: string;
  profile?: {
    first_name?: string;
    specialization?: string;
    specialization_display?: string;
    bio?: string;
    fee?: string | number;
  };
}

type TabMode = 'login' | 'register';

function App() {
  const [loading, setLoading] = useState<boolean>(false);
  const [isLogged, setIsLogged] = useState<boolean>(
    Boolean(localStorage.getItem('jwt_access'))
  );
  const [tab, setTab] = useState<TabMode>('login');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Форма входа/регистрации
  const [userField, setUserField] = useState<string>('');
  const [passField, setPassField] = useState<string>('');
  const [emailField, setEmailField] = useState<string>('');

  // Профиль
  const [musician, setMusician] = useState<MusicianData | null>(null);
  const [specList, setSpecList] = useState<SpecOption[]>([
    { value: 'vocal', label: 'Вокал' },
    { value: 'guitar', label: 'Гитара' },
    { value: 'bass', label: 'Бас-гитара' },
    { value: 'drums', label: 'Ударные' },
    { value: 'keys', label: 'Клавишные' },
    { value: 'other', label: 'Другое' },
  ]);

  const [editActive, setEditActive] = useState<boolean>(false);
  const [firstName, setFirstName] = useState<string>('');
  const [specValue, setSpecValue] = useState<string>('other');
  const [bioValue, setBioValue] = useState<string>('');
  const [feeValue, setFeeValue] = useState<string>('0.00');

  useEffect(() => {
    fetchSpecializations();
    if (isLogged) {
      loadProfileData();
    }
  }, [isLogged]);

  const fetchSpecializations = async () => {
    try {
      const res = await fetch(ENDPOINTS.specializations);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setSpecList(
            data.map((item: Record<string, string>) => ({
              value: item.value || item.key || item.code || 'other',
              label: item.label || item.name || item.display || 'Другое',
            }))
          );
        }
      }
    } catch {
      // Использовать дефолтный список
    }
  };

  const authFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    let access = localStorage.getItem('jwt_access');
    const refresh = localStorage.getItem('jwt_refresh');

    const headers = new Headers(options.headers || {});
    if (access) {
      headers.set('Authorization', `Bearer ${access}`);
    }
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    let res = await fetch(url, { ...options, headers });

    if (res.status === 401 && refresh) {
      try {
        const refreshRes = await fetch(ENDPOINTS.refreshToken, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh }),
        });

        if (refreshRes.ok) {
          const tData = await refreshRes.json();
          access = tData.access;
          localStorage.setItem('jwt_access', tData.access);
          if (tData.refresh) {
            localStorage.setItem('jwt_refresh', tData.refresh);
          }
          headers.set('Authorization', `Bearer ${access}`);
          res = await fetch(url, { ...options, headers });
        } else {
          clientLogout();
        }
      } catch {
        clientLogout();
      }
    }

    return res;
  };

  const syncProfile = (data: MusicianData) => {
    setMusician(data);
    setFirstName(data.profile?.first_name || '');
    setSpecValue(data.profile?.specialization || 'other');
    setBioValue(data.profile?.bio || '');
    setFeeValue(String(data.profile?.fee ?? '0.00'));
  };

  const loadProfileData = async () => {
    setLoading(true);
    try {
      const res = await authFetch(ENDPOINTS.profile, { method: 'GET' });
      if (!res.ok) {
        throw new Error(`Ошибка загрузки профиля (${res.status})`);
      }
      const data: MusicianData = await res.json();
      syncProfile(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка профиля');
      clientLogout();
    } finally {
      setLoading(false);
    }
  };

  // Парсинг точного текста ошибки от сервера
  const extractError = (data: Record<string, unknown>, fallback: string): string => {
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.non_field_errors)) return String(data.non_field_errors[0]);
    if (Array.isArray(data.username)) return `Логин: ${data.username[0]}`;
    if (Array.isArray(data.password)) return `Пароль: ${data.password[0]}`;
    if (Array.isArray(data.email)) return `Email: ${data.email[0]}`;
    return fallback;
  };

  // Регистрация
  const handleRegister = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setOkMsg(null);
    setLoading(true);

    try {
      const res = await fetch(ENDPOINTS.register, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: userField.trim(),
          email: emailField.trim(),
          password: passField,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(extractError(data, 'Не удалось зарегистрироваться'));
      }

      setOkMsg(`Пользователь ${userField} успешно создан! Теперь войдите.`);
      setTab('login');
      setPassField('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Сбой регистрации');
    } finally {
      setLoading(false);
    }
  };

  // Вход
  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setOkMsg(null);
    setLoading(true);

    try {
      const res = await fetch(ENDPOINTS.login, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: userField.trim(),
          password: passField,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(extractError(data, 'Неверный логин или пароль'));
      }

      const access = data.access || data.token;
      if (!access) {
        throw new Error('Сервер не вернул access токен');
      }

      localStorage.setItem('jwt_access', access);
      if (data.refresh) {
        localStorage.setItem('jwt_refresh', data.refresh);
      }
      localStorage.setItem('jwt_user', userField.trim());

      setIsLogged(true);
      setPassField('');
      setOkMsg('Вход выполнен успешно!');

      const pRes = await fetch(ENDPOINTS.profile, {
        headers: {
          'Authorization': `Bearer ${access}`,
          'Content-Type': 'application/json',
        },
      });

      if (pRes.ok) {
        const pData = await pRes.json();
        syncProfile(pData);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка авторизации');
    } finally {
      setLoading(false);
    }
  };

  // Сохранение профиля
  const handleProfileUpdate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setOkMsg(null);
    setLoading(true);

    try {
      const payload = {
        first_name: firstName,
        specialization: specValue,
        bio: bioValue,
        fee: feeValue,
        profile: {
          first_name: firstName,
          specialization: specValue,
          bio: bioValue,
          fee: feeValue,
        },
      };

      const res = await authFetch(ENDPOINTS.profile, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(extractError(data, 'Ошибка сохранения анкеты'));
      }

      if (data.profile) {
        syncProfile(data);
      } else {
        syncProfile({
          ...musician,
          username: musician?.username || userField || localStorage.getItem('jwt_user') || '',
          profile: {
            first_name: data.first_name ?? firstName,
            specialization: data.specialization ?? specValue,
            specialization_display:
              data.specialization_display ??
              specList.find((s) => s.value === specValue)?.label ??
              specValue,
            bio: data.bio ?? bioValue,
            fee: data.fee ?? feeValue,
          },
        });
      }

      setEditActive(false);
      setOkMsg('Анкета участника успешно сохранена!');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка обновления');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    const refresh = localStorage.getItem('jwt_refresh');
    const access = localStorage.getItem('jwt_access');

    try {
      if (refresh) {
        await fetch(ENDPOINTS.logout, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(access ? { 'Authorization': `Bearer ${access}` } : {}),
          },
          body: JSON.stringify({ refresh }),
        });
      }
    } catch {
      // Игнорируем сетевые сбои при логауте
    } finally {
      clientLogout();
      setLoading(false);
      setOkMsg('Вы вышли из учетной записи.');
    }
  };

  const clientLogout = () => {
    localStorage.removeItem('jwt_access');
    localStorage.removeItem('jwt_refresh');
    localStorage.removeItem('jwt_user');
    setIsLogged(false);
    setMusician(null);
    setEditActive(false);
  };

  return (
    <div translate="no" className="notranslate">
      <div className="top-bar">
        AMBER BEAT • JWT INAI COL3 SECURED • WORLD TOUR 2026
      </div>

      <header className="nav-shell">
        <div className="brand-badge">
          <span>🎸 AMBER BEAT</span>
          <span className="badge-pill">JWT System</span>
        </div>

        <div className="auth-nav-actions">
          {isLogged ? (
            <>
              <span style={{ fontSize: '0.9rem', color: '#f59e0b', fontWeight: 700 }}>
                {musician?.username || localStorage.getItem('jwt_user')}
              </span>
              <button className="nav-btn nav-btn-danger" onClick={handleLogout}>
                Выйти
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`nav-btn ${tab === 'login' ? 'nav-btn-active' : ''}`}
                onClick={() => { setTab('login'); setErrorMsg(null); }}
              >
                Вход
              </button>
              <button
                type="button"
                className={`nav-btn ${tab === 'register' ? 'nav-btn-active' : ''}`}
                onClick={() => { setTab('register'); setErrorMsg(null); }}
              >
                Регистрация
              </button>
            </>
          )}
        </div>
      </header>

      <main className="page-grid">
        {/* ЛЕВАЯ КОЛОНКА */}
        <aside className="card-frame">
          {errorMsg && <div className="status-banner status-banner-err">{errorMsg}</div>}
          {okMsg && <div className="status-banner status-banner-ok">{okMsg}</div>}

          {!isLogged ? (
            tab === 'login' ? (
              <form onSubmit={handleLogin}>
                <div className="card-head">
                  <span>Вход в систему</span>
                </div>
                <div className="form-row">
                  <label>Логин (Username)</label>
                  <input
                    type="text"
                    placeholder="Введите логин"
                    value={userField}
                    onChange={(e) => setUserField(e.target.value)}
                    required
                  />
                </div>
                <div className="form-row">
                  <label>Пароль</label>
                  <input
                    type="password"
                    placeholder="Введите пароль"
                    value={passField}
                    onChange={(e) => setPassField(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="submit-btn" disabled={loading}>
                  {loading ? 'Проверка...' : 'Войти'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister}>
                <div className="card-head">
                  <span>Регистрация участника</span>
                </div>
                <div className="form-row">
                  <label>Логин (от 3-4 символов)</label>
                  <input
                    type="text"
                    placeholder="Придумайте логин"
                    value={userField}
                    onChange={(e) => setUserField(e.target.value)}
                    required
                  />
                </div>
                <div className="form-row">
                  <label>Email</label>
                  <input
                    type="email"
                    placeholder="band@example.com"
                    value={emailField}
                    onChange={(e) => setEmailField(e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <label>Пароль</label>
                  <input
                    type="password"
                    placeholder="Не менее 6 символов"
                    value={passField}
                    onChange={(e) => setPassField(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="submit-btn" disabled={loading}>
                  {loading ? 'Создание...' : 'Зарегистрироваться'}
                </button>
              </form>
            )
          ) : (
            <div>
              <div className="card-head">
                <span>Профиль музыканта</span>
                <button className="nav-btn" onClick={loadProfileData} title="Обновить">
                  ↻
                </button>
              </div>

              {!editActive ? (
                <div>
                  <div className="profile-meta-card">
                    <div className="meta-item">
                      <span className="meta-label">ID участника:</span>
                      <span className="meta-val">#{musician?.id ?? '—'}</span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Логин:</span>
                      <span className="meta-val">{musician?.username || localStorage.getItem('jwt_user')}</span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Имя:</span>
                      <span className="meta-val">{musician?.profile?.first_name || 'Не заполнено'}</span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Роль в группе:</span>
                      <span className="meta-val">
                        {musician?.profile?.specialization_display ||
                          musician?.profile?.specialization ||
                          'Другое'}
                      </span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Ставка за сет:</span>
                      <span className="meta-val">${musician?.profile?.fee ?? '0.00'}</span>
                    </div>
                    <div className="meta-bio">
                      <strong>О себе:</strong>{' '}
                      {musician?.profile?.bio || 'Данные пока не заполнены.'}
                    </div>
                  </div>

                  <button
                    className="submit-btn"
                    onClick={() => setEditActive(true)}
                  >
                    ✏️ Редактировать профиль
                  </button>
                </div>
              ) : (
                <form onSubmit={handleProfileUpdate}>
                  <div className="form-row">
                    <label>Имя</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Ваше имя"
                    />
                  </div>

                  <div className="form-row">
                    <label>Специализация</label>
                    <select
                      value={specValue}
                      onChange={(e) => setSpecValue(e.target.value)}
                    >
                      {specList.map((s) => (
                        <option key={s.value} value={s.value} style={{ background: '#08090d', color: '#fff' }}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-row">
                    <label>Гонорар ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={feeValue}
                      onChange={(e) => setFeeValue(e.target.value)}
                    />
                  </div>

                  <div className="form-row">
                    <label>Биография / О себе</label>
                    <textarea
                      rows={3}
                      value={bioValue}
                      onChange={(e) => setBioValue(e.target.value)}
                      placeholder="Опыт, инструменты..."
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="submit" className="submit-btn" style={{ flex: 1 }}>
                      Сохранить
                    </button>
                    <button
                      type="button"
                      className="nav-btn"
                      onClick={() => setEditActive(false)}
                      style={{ padding: '12px' }}
                    >
                      Отмена
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </aside>

        {/* ПРАВАЯ КОЛОНКА */}
        <section>
          <div className="promo-banner">
            <h1>AMBER BEAT COLLECTIVE</h1>
            <p>Официальный портал группы • Интеграция JWT</p>
          </div>

          <div className="card-frame" style={{ marginBottom: '24px' }}>
            <div className="card-head">
              <span>Дискография и релизы</span>
            </div>
            <div className="album-grid">
              <div className="album-item">
                <span className="album-tag">LP • 2026</span>
                <h3>Amber Horizon</h3>
                <p>Аналоговый инди-рок, сведенный в студии Бишкека.</p>
              </div>
              <div className="album-item">
                <span className="album-tag">EP • 2025</span>
                <h3>Highland Drive</h3>
                <p>Акустические треки, записанные в ущельях Тянь-Шаня.</p>
              </div>
              <div className="album-item">
                <span className="album-tag">LIVE • 2024</span>
                <h3>Zepp Tokyo Riot</h3>
                <p>Живой концерт перед 10 000 слушателей.</p>
              </div>
            </div>
          </div>

          <div className="card-frame">
            <div className="card-head">
              <span>График тура</span>
            </div>
            <table className="concert-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Локация</th>
                  <th>Арена</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>14 НОЯ</td>
                  <td>Бишкек, KG</td>
                  <td>Bishkek Arena</td>
                  <td><span style={{ color: '#f59e0b', fontWeight: 700 }}>Билеты в кассах</span></td>
                </tr>
                <tr>
                  <td>20 НОЯ</td>
                  <td>Ош, KG</td>
                  <td>Central Stadium</td>
                  <td><span style={{ color: '#f59e0b', fontWeight: 700 }}>Мало билетов</span></td>
                </tr>
                <tr>
                  <td>28 НОЯ</td>
                  <td>Алматы, KZ</td>
                  <td>Halyk Arena</td>
                  <td><span style={{ color: '#22c55e', fontWeight: 700 }}>В продаже</span></td>
                </tr>
                <tr>
                  <td>09 ДЕК</td>
                  <td>Берлин, DE</td>
                  <td>Verti Music Hall</td>
                  <td><span style={{ color: '#ef4444', fontWeight: 700 }}>Sold Out</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;