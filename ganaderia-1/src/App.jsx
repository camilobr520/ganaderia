import { useEffect, useRef, useState } from 'react'
import supabase from './supabase-client'
import './App.css'

const STORAGE_KEY = 'ganaderia-vacas'

function readStoredCows() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []

    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) {
      throw new Error('El formato guardado de las vacas no es válido.')
    }

    return parsed.filter(
      (cow) => cow && typeof cow.name === 'string' && cow.id != null,
    )
  } catch (error) {
    console.error('No se pudieron leer las vacas guardadas:', error)
    return []
  }
}

function App() {
  const [vacasList, setVacasList] = useState(readStoredCows)
  const [newVaca, setNewVaca] = useState('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [notice, setNotice] = useState('')
  const syncing = useRef(false)
  const vacasRef = useRef(vacasList)

  const updateVacasList = (update) => {
    const updatedList = update(vacasRef.current)
    vacasRef.current = updatedList
    setVacasList(updatedList)

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList))
    } catch (error) {
      console.error('No se pudieron guardar las vacas en este dispositivo:', error)
      setNotice('No se pudieron guardar los datos en este dispositivo.')
    }
  }

  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', updateConnection)
    window.addEventListener('offline', updateConnection)
    return () => {
      window.removeEventListener('online', updateConnection)
      window.removeEventListener('offline', updateConnection)
    }
  }, [])

  useEffect(() => {
    const handleInstallPrompt = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
    }
    const handleInstalled = () => setInstallPrompt(null)

    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('No se pudo registrar el service worker:', error)
      setNotice('No se pudo activar el modo sin conexión en este navegador.')
    })
  }, [])

  useEffect(() => {
    const pendingCows = vacasList.filter((cow) => cow.syncStatus === 'pending')
    if (!isOnline || !supabase || !pendingCows.length || syncing.current) return

    syncing.current = true
    const syncPendingCows = async () => {
      try {
        for (const cow of pendingCows) {
          const { data, error } = await supabase
            .from('Vaca')
            .insert([
              {
                name: cow.name,
                raza: cow.raza,
                date_purchase: cow.date_purchase,
              },
            ])
            .select()
            .single()

          if (error) {
            console.error('No se pudo sincronizar una vaca:', error)
            setNotice('No se pudieron sincronizar algunas vacas. Se volverá a intentar al reconectar.')
            break
          }

          updateVacasList((current) =>
            current.map((item) =>
              item.id === cow.id ? { ...data, syncStatus: 'synced' } : item,
            ),
          )
        }
      } catch (error) {
        console.error('Error al sincronizar las vacas pendientes:', error)
        setNotice('Ocurrió un error al sincronizar las vacas pendientes.')
      } finally {
        syncing.current = false
      }
    }

    syncPendingCows()
  }, [isOnline, vacasList])

  const addVaca = async (event) => {
    event.preventDefault()
    const name = newVaca.trim()
    if (!name) return

    const cow = {
      id: crypto.randomUUID(),
      name,
      raza: 'Holstein',
      date_purchase: '2022-02-11',
    }

    if (!isOnline || !supabase) {
      updateVacasList((current) => [
        ...current,
        { ...cow, syncStatus: 'pending' },
      ])
      setNewVaca('')
      setNotice(
        !isOnline
          ? 'Vaca guardada en este dispositivo. Se sincronizará al recuperar la conexión.'
          : 'Vaca guardada en este dispositivo. Configura Supabase para sincronizarla.',
      )
      return
    }

    const { data, error } = await supabase
      .from('Vaca')
      .insert([
        { name: cow.name, raza: cow.raza, date_purchase: cow.date_purchase },
      ])
      .select()
      .single()

    if (error) {
      console.error('Error al agregar la vaca:', error)
      setNotice(`No se pudo agregar la vaca: ${error.message}`)
      return
    }

    updateVacasList((current) => [
      ...current,
      { ...data, syncStatus: 'synced' },
    ])
    setNewVaca('')
    setNotice('Vaca agregada correctamente.')
  }

  const installApp = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setNotice('La app se está instalando.')
    setInstallPrompt(null)
  }

  const pendingCount = vacasList.filter(
    (cow) => cow.syncStatus === 'pending',
  ).length

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Ganadería, inicio">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 40 40" fill="none">
              <path d="M8 16 5 10l9 3m18 3 3-6-9 3" />
              <path d="M10 15c0-3 4-5 10-5s10 2 10 5v11c0 5-4 8-10 8s-10-3-10-8V15Z" />
              <path d="M14 21h.1M26 21h.1M16 28c2 2 6 2 8 0" />
            </svg>
          </span>
          <span>campo<span className="brand-accent">vivo</span></span>
        </a>
        <div className="topbar-actions">
          <span className={`connection ${isOnline ? 'is-online' : 'is-offline'}`}>
            <span className="connection-dot" />
            {isOnline ? 'En línea' : 'Sin conexión'}
          </span>
          {installPrompt && (
            <button className="install-button" onClick={installApp}>
              Instalar app
            </button>
          )}
        </div>
      </header>

      <section className="intro">
        <div className="intro-copy">
          <p className="eyebrow">TU CAMPO, EN ORDEN</p>
          <h1>Un mejor cuidado empieza por conocerlas.</h1>
          <p className="intro-description">
            Lleva un registro simple de tu ganado, estés donde estés.
          </p>
        </div>
        <div className="cow-illustration" aria-hidden="true">
          <span className="sun" />
          <svg viewBox="0 0 260 190" fill="none">
            <path className="hill hill-back" d="M0 145c47-38 91-25 128-7 45 21 79 4 132-30v82H0v-45Z" />
            <path className="hill hill-front" d="M0 157c39-20 76-13 120 2 48 16 87-8 140-27v58H0v-33Z" />
            <path className="cow-body" d="M54 82c0-21 17-38 38-38h70c19 0 34 15 34 34v44c0 13-10 23-23 23H83c-16 0-29-13-29-29V82Z" />
            <path className="cow-patch" d="M104 48c18-7 31 1 36 13 5 13-3 23-16 27-16 5-31-3-31-17 0-10 3-18 11-23Z" />
            <path className="cow-head" d="M171 59c13-7 32-1 39 12l9 18c5 11 0 24-11 29l-18 8-30-13 1-42 10-12Z" />
            <path className="cow-ear" d="m174 62-22-12c-5-3-11 2-8 7l13 20m55-4 14-17c4-5 11-2 10 4l-6 23" />
            <path className="cow-muzzle" d="M192 101c9-7 24-3 28 6 4 10-6 17-18 17-10 0-18-5-17-12 0-4 3-8 7-11Z" />
            <path className="cow-eye" d="M193 86h.1" />
            <path className="cow-leg" d="M79 137v31m22-29v29m70-29v29m20-36v36" />
            <path className="grass" d="m26 166 7-14 3 14 8-10 1 10m176-1 7-17 3 17 9-12 1 12" />
          </svg>
          <span className="illustration-caption">Cuidar bien también es llevar la cuenta.</span>
        </div>
      </section>

      <section className="workspace" aria-label="Registro de vacas">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TU GANADO</p>
            <h2>Registro de vacas</h2>
          </div>
          <div className="herd-count">
            <span className="count-number">{vacasList.length}</span>
            <span>{vacasList.length === 1 ? 'animal' : 'animales'}</span>
          </div>
        </div>

        <form className="add-form" onSubmit={addVaca}>
          <label htmlFor="cow-name">Añadir al registro</label>
          <div className="form-controls">
            <div className="input-wrap">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 10 3 6l5 2m8 0 5-2-1 4m-14 0c0-2 3-4 6-4s6 2 6 4v7c0 2-3 4-6 4s-6-2-6-4v-7Z" />
                <path d="M9 13h.1m6-.1h.1M10 17c1 1 3 1 4 0" />
              </svg>
              <input
                id="cow-name"
                type="text"
                placeholder="Ej. Luna"
                value={newVaca}
                onChange={(event) => setNewVaca(event.target.value)}
                maxLength={80}
                required
              />
            </div>
            <button className="add-button" type="submit" disabled={!newVaca.trim()}>
              <span aria-hidden="true">+</span>
              Agregar vaca
            </button>
          </div>
          <p className="form-hint">Raza Holstein · Compra 11 feb 2022</p>
        </form>

        {notice && (
          <p className="notice" role="status">
            {notice}
            <button
              className="dismiss-notice"
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => setNotice('')}
            >
              ×
            </button>
          </p>
        )}

        <div className="list-heading">
          <h3>Animales registrados</h3>
          {pendingCount > 0 && (
            <span className="pending-summary">
              {pendingCount} pendiente{pendingCount === 1 ? '' : 's'} de sincronizar
            </span>
          )}
        </div>

        {vacasList.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none">
                <path d="M12 19 9 12l10 4m14 3 6-7-11 4" />
                <path d="M13 18c0-3 5-6 11-6s11 3 11 6v13c0 6-5 10-11 10s-11-4-11-10V18Z" />
                <path d="M19 24h.1m10-.1h.1m-9 7c2 2 6 2 8 0" />
              </svg>
            </span>
            <h4>Aún no hay vacas en tu registro</h4>
            <p>Agrega la primera y empieza a organizar tu ganado.</p>
          </div>
        ) : (
          <ul className="cow-list">
            {vacasList.map((vaca) => (
              <li className="cow-card" key={vaca.id}>
                <span className="cow-avatar" aria-hidden="true">
                  <svg viewBox="0 0 32 32" fill="none">
                    <path d="m8 12-2-5 7 3m11 2 3-5-7 3" />
                    <path d="M9 12c0-2 3-4 7-4s7 2 7 4v9c0 4-3 6-7 6s-7-2-7-6v-9Z" />
                    <path d="M13 17h.1m6-.1h.1m-6 5c1 1 3 1 4 0" />
                  </svg>
                </span>
                <span className="cow-details">
                  <span className="cow-name">{vaca.name}</span>
                  <span className="cow-meta">
                    {vaca.raza || 'Holstein'} <span>·</span> Compra{' '}
                    {vaca.date_purchase === '2022-02-11'
                      ? '11 feb 2022'
                      : vaca.date_purchase}
                  </span>
                </span>
                <span
                  className={`sync-status ${
                    vaca.syncStatus === 'pending' ? 'is-pending' : ''
                  }`}
                >
                  <span className="status-dot" />
                  {vaca.syncStatus === 'pending' ? 'Pendiente' : 'Sincronizada'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="footer">
        <span>Hecho para cuidar mejor.</span>
        <span className="footer-sync">
          {pendingCount > 0
            ? `${pendingCount} cambio${pendingCount === 1 ? '' : 's'} por sincronizar`
            : 'Tus registros están al día'}
        </span>
      </footer>
    </main>
  )
}

export default App
