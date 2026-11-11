import { useEffect, useRef, useState } from 'react'
import supabase from './supabase-client'
import { SEGUIMIENTO_OPTIONS } from './seguimiento-enums'
import './App.css'

const STORAGE_KEY = 'ganaderia-vacas'

function getToday() {
  const today = new Date()
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
  return localDate.toISOString().slice(0, 10)
}

function createEmptySeguimiento() {
  return {
    date_bred: '',
    type_bred: '',
    name_bull: '',
    date_palpation: '',
    state: '',
    date_birth: '',
    baby_sex: '',
    observations: '',
  }
}

function formatDate(value) {
  if (!value) return ''
  return new Date(`${value}T00:00:00`).toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function getOptionLabel(options, value) {
  return options.find((option) => option.value === value)?.label || ''
}

function getSeguimientoDisplayRows(record) {
  if (!record) return []

  return [
    ['Fecha de monta o inseminación', formatDate(record.date_bred)],
    [
      'Tipo de servicio',
      getOptionLabel(SEGUIMIENTO_OPTIONS.tipoServicio, record.type_bred),
    ],
    ['Nombre del toro', record.name_bull],
    ['Fecha de palpación', formatDate(record.date_palpation)],
    [
      'Resultado de palpación',
      getOptionLabel(SEGUIMIENTO_OPTIONS.estadoPalpacion, record.state),
    ],
    ['Fecha de nacimiento', formatDate(record.date_birth)],
    ['Sexo de la cría', getOptionLabel(SEGUIMIENTO_OPTIONS.sexoCria, record.baby_sex)],
    ['Observaciones', record.observations],
  ].filter(([, value]) => value != null && String(value).trim() !== '')
}

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
  const [vacasList, setVacasList] = useState(() =>
    navigator.onLine && supabase ? [] : readStoredCows(),
  )
  const [newVaca, setNewVaca] = useState('')
  const [newRaza, setNewRaza] = useState('')
  const [newPurchaseDate, setNewPurchaseDate] = useState('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [loadingCows, setLoadingCows] = useState(
    () => navigator.onLine && Boolean(supabase),
  )
  const [installPrompt, setInstallPrompt] = useState(null)
  const [notice, setNotice] = useState('')
  const [activeCow, setActiveCow] = useState(null)
  const [seguimientoRecord, setSeguimientoRecord] = useState(null)
  const [seguimientoForm, setSeguimientoForm] = useState(createEmptySeguimiento)
  const [loadingSeguimiento, setLoadingSeguimiento] = useState(false)
  const [savingSeguimiento, setSavingSeguimiento] = useState(false)
  const [seguimientoError, setSeguimientoError] = useState('')
  const [seguimientoMessage, setSeguimientoMessage] = useState('')
  const [expandedCowId, setExpandedCowId] = useState(null)
  const [cowSeguimientos, setCowSeguimientos] = useState({})
  const syncing = useRef(false)
  const vacasRef = useRef(vacasList)
  const detailCloseRef = useRef(null)

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
    if (!isOnline || !supabase) return

    let cancelled = false
    const loadCows = async () => {
      try {
        const { data, error } = await supabase
          .from('Vaca')
          .select('*')
          .order('id', { ascending: false })

        if (cancelled) return
        if (error) {
          console.error('Error al cargar las vacas desde Supabase:', error)
          setNotice(`No se pudo actualizar el registro desde Supabase: ${error.message}`)
          setLoadingCows(false)
          return
        }

        const pendingCows = [
          ...readStoredCows().filter((cow) => cow.syncStatus === 'pending'),
          ...vacasRef.current.filter((cow) => cow.syncStatus === 'pending'),
        ]
        const uniquePendingCows = [
          ...new Map(pendingCows.map((cow) => [String(cow.id), cow])).values(),
        ]
        const databaseCows = (data || []).map((cow) => ({
          ...cow,
          syncStatus: 'synced',
        }))
        const mergedCows = [...databaseCows, ...uniquePendingCows]

        vacasRef.current = mergedCows
        setVacasList(mergedCows)
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedCows))
        } catch (storageError) {
          console.error('No se pudieron guardar las vacas en este dispositivo:', storageError)
          setNotice('No se pudieron guardar los datos en este dispositivo.')
        }
      } catch (error) {
        if (cancelled) return
        console.error('Error al consultar las vacas desde Supabase:', error)
        setNotice('Ocurrió un error al consultar las vacas desde Supabase.')
      } finally {
        if (!cancelled) setLoadingCows(false)
      }
    }

    loadCows()
    return () => {
      cancelled = true
    }
  }, [isOnline])

  useEffect(() => {
    const updateConnection = () => {
      setIsOnline(navigator.onLine)
      if (!navigator.onLine) {
        setLoadingCows(false)
      } else if (supabase) {
        setLoadingCows(true)
      }
    }
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
    if (!activeCow) return

    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !savingSeguimiento) {
        setActiveCow(null)
      }
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [activeCow, savingSeguimiento])

  useEffect(() => {
    if (activeCow) detailCloseRef.current?.focus()
  }, [activeCow])

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
    if (loadingCows) return
    const name = newVaca.trim()
    if (!name) return

    const cow = {
      id: crypto.randomUUID(),
      name,
      raza: newRaza.trim(),
      date_purchase: newPurchaseDate,
    }

    if (!isOnline || !supabase) {
      updateVacasList((current) => [
        ...current,
        { ...cow, syncStatus: 'pending' },
      ])
      setNewVaca('')
      setNewRaza('')
      setNewPurchaseDate('')
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
    setNewRaza('')
    setNewPurchaseDate('')
    setNotice('Vaca agregada correctamente.')
  }

  const installApp = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setNotice('La app se está instalando.')
    setInstallPrompt(null)
  }

  const openSeguimiento = async (cow) => {
    if (cow.syncStatus === 'pending') {
      setNotice('Espera a que la vaca se sincronice antes de registrar su seguimiento.')
      return
    }

    setActiveCow(cow)
    setSeguimientoRecord(null)
    setSeguimientoForm(createEmptySeguimiento())
    setSeguimientoError('')
    setSeguimientoMessage('')
    setLoadingSeguimiento(true)

    if (!supabase || !navigator.onLine) {
      setSeguimientoError(
        'Se necesita conexión a internet para consultar o guardar el seguimiento.',
      )
      setLoadingSeguimiento(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from('Seguimiento')
        .select('*')
        .eq('id_vaca', cow.id)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('Error al cargar el seguimiento:', error)
        setSeguimientoError(`No se pudo cargar el seguimiento: ${error.message}`)
        return
      }

      if (!data) return

      setSeguimientoRecord(data)
      setCowSeguimientos((current) => ({
        ...current,
        [String(cow.id)]: { loaded: true, record: data },
      }))
      setSeguimientoForm({
        date_bred: data.date_bred || '',
        type_bred: data.type_bred == null ? '' : String(data.type_bred),
        name_bull: data.name_bull || '',
        date_palpation: data.date_palpation || '',
        state: data.state == null ? '' : String(data.state),
        date_birth: data.date_birth || '',
        baby_sex: data.baby_sex == null ? '' : String(data.baby_sex),
        observations: data.observations || '',
      })
    } catch (error) {
      console.error('Error al consultar el seguimiento:', error)
      setSeguimientoError('Ocurrió un error al consultar el seguimiento.')
    } finally {
      setLoadingSeguimiento(false)
    }
  }

  const closeSeguimiento = () => {
    if (savingSeguimiento) return
    setActiveCow(null)
  }

  const updateSeguimientoField = (event) => {
    const { name, value } = event.target
    setSeguimientoForm((current) => ({ ...current, [name]: value }))
  }

  const saveSeguimiento = async (event) => {
    event.preventDefault()
    if (!activeCow || !supabase || !navigator.onLine) {
      setSeguimientoError(
        'Se necesita conexión a internet para guardar el seguimiento.',
      )
      return
    }

    const payload = {
      id_vaca: activeCow.id,
      date_bred: seguimientoForm.date_bred || null,
      type_bred:
        seguimientoForm.type_bred === ''
          ? null
          : Number(seguimientoForm.type_bred),
      name_bull: seguimientoForm.name_bull.trim() || null,
      date_palpation: seguimientoForm.date_palpation || null,
      state: seguimientoForm.state === '' ? null : Number(seguimientoForm.state),
      date_birth: seguimientoForm.date_birth || null,
      baby_sex:
        seguimientoForm.baby_sex === ''
          ? null
          : Number(seguimientoForm.baby_sex),
      observations: seguimientoForm.observations.trim() || null,
    }

    setSavingSeguimiento(true)
    setSeguimientoError('')
    setSeguimientoMessage('')

    try {
      const query = seguimientoRecord
        ? supabase
            .from('Seguimiento')
            .update(payload)
            .eq('id', seguimientoRecord.id)
            .eq('id_vaca', activeCow.id)
        : supabase.from('Seguimiento').insert(payload)
      const { data, error } = await query.select().single()

      if (error) {
        console.error('Error al guardar el seguimiento:', error)
        setSeguimientoError(`No se pudo guardar el seguimiento: ${error.message}`)
        return
      }

      setSeguimientoRecord(data)
      setCowSeguimientos((current) => ({
        ...current,
        [String(activeCow.id)]: { loaded: true, record: data },
      }))
      setSeguimientoMessage('Seguimiento guardado correctamente.')
    } catch (error) {
      console.error('Error al guardar el seguimiento:', error)
      setSeguimientoError('Ocurrió un error al guardar el seguimiento.')
    } finally {
      setSavingSeguimiento(false)
    }
  }

  const pendingCount = vacasList.filter(
    (cow) => cow.syncStatus === 'pending',
  ).length
  const today = getToday()

  const toggleCowSeguimiento = async (cow, retry = false) => {
    const cowId = String(cow.id)
    if (expandedCowId === cowId && !retry) {
      setExpandedCowId(null)
      return
    }

    setExpandedCowId(cowId)
    if (cowSeguimientos[cowId]?.loaded || cowSeguimientos[cowId]?.loading) return

    if (cow.syncStatus === 'pending' || !supabase || !isOnline) {
      setCowSeguimientos((current) => ({
        ...current,
        [cowId]: {
          loaded: true,
          record: null,
          error: 'El seguimiento se mostrará cuando la vaca esté sincronizada y haya conexión.',
        },
      }))
      return
    }

    setCowSeguimientos((current) => ({
      ...current,
      [cowId]: { loaded: false, loading: true, record: null },
    }))

    try {
      const { data, error } = await supabase
        .from('Seguimiento')
        .select('*')
        .eq('id_vaca', cow.id)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('Error al cargar el detalle de seguimiento:', error)
        setCowSeguimientos((current) => ({
          ...current,
          [cowId]: {
            loaded: true,
            record: null,
            error: `No se pudo consultar el seguimiento: ${error.message}`,
          },
        }))
        return
      }

      setCowSeguimientos((current) => ({
        ...current,
        [cowId]: { loaded: true, record: data },
      }))
    } catch (error) {
      console.error('Error al consultar el detalle de seguimiento:', error)
      setCowSeguimientos((current) => ({
        ...current,
        [cowId]: {
          loaded: true,
          record: null,
          error: 'Ocurrió un error al consultar el seguimiento.',
        },
      }))
    }
  }

  return (
    <main className={`app-shell ${activeCow ? 'app-shell-detail' : ''}`}>
      {!activeCow && (
        <>
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
            <h2>Registro de vacas 1.1 </h2>
          </div>
          <div className="herd-count">
            <span className="count-number">{vacasList.length}</span>
            <span>{vacasList.length === 1 ? 'animal' : 'animales'}</span>
          </div>
        </div>

        <form className="add-form" onSubmit={addVaca}>
          <div className="form-controls">
            <div className="field-group">
              <label htmlFor="cow-name">Nombre</label>
              <div className="input-wrap">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 10 3 6l5 2m8 0 5-2-1 4m-14 0c0-2 3-4 6-4s6 2 6 4v7c0 2-3 4-6 4s-6-2-6-4v-7Z" />
                  <path d="M9 13h.1m6-.1h.1M10 17c1 1 3 1 4 0" />
                </svg>
                <input
                  id="cow-name"
                  type="text"
                  placeholder="Nombre de la vaca"
                  value={newVaca}
                  onChange={(event) => setNewVaca(event.target.value)}
                  maxLength={80}
                  required
                />
              </div>
            </div>
            <div className="field-group">
              <label htmlFor="cow-breed">Raza</label>
              <div className="input-wrap">
                <input
                  id="cow-breed"
                  type="text"
                  placeholder="raza de la vaca"
                  value={newRaza}
                  onChange={(event) => setNewRaza(event.target.value)}
                  maxLength={80}
                  required
                />
              </div>
            </div>
            <div className="field-group">
              <label htmlFor="cow-purchase-date">Fecha de compra</label>
              <div className="input-wrap">
                <input
                  id="cow-purchase-date"
                  type="date"
                  value={newPurchaseDate}
                  max={today}
                  onChange={(event) => setNewPurchaseDate(event.target.value)}
                  required
                />
              </div>
            </div>
            <div className="form-submit">
              <button
                className="add-button"
                type="submit"
                disabled={loadingCows || !newVaca.trim() || !newRaza.trim()}
              >
                <span aria-hidden="true">+</span>
                Agregar vaca
              </button>
            </div>
          </div>
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

        {loadingCows ? (
          <div className="empty-state" role="status">
            <span className="loading-spinner" />
            <h4>Consultando el registro</h4>
            <p>Estamos cargando los animales desde la base de datos.</p>
          </div>
        ) : vacasList.length === 0 ? (
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
                <div className="cow-card-main">
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
                      {vaca.raza || 'Raza no especificada'} <span>·</span>{' '}
                      {vaca.date_purchase
                        ? `Compra ${formatDate(vaca.date_purchase)}`
                        : 'Fecha de compra no especificada'}
                    </span>
                  </span>
                  <div className="cow-card-actions">
                    <span
                      className={`sync-status ${
                        vaca.syncStatus === 'pending' ? 'is-pending' : ''
                      }`}
                    >
                      <span className="status-dot" />
                      {vaca.syncStatus === 'pending' ? 'Pendiente' : 'Sincronizada'}
                    </span>
                    <button
                      className="detail-button"
                      type="button"
                      onClick={() => openSeguimiento(vaca)}
                    >
                      Detalle
                    </button>
                  </div>
                </div>
                <button
                  className="cow-accordion-toggle"
                  type="button"
                  aria-expanded={expandedCowId === String(vaca.id)}
                  aria-controls={`cow-follow-up-${vaca.id}`}
                  onClick={() => toggleCowSeguimiento(vaca)}
                >
                  <span>
                    {expandedCowId === String(vaca.id)
                      ? 'Ocultar seguimiento'
                      : 'Ver seguimiento'}
                  </span>
                  <span className="accordion-chevron" aria-hidden="true">
                    {expandedCowId === String(vaca.id) ? '⌃' : '⌄'}
                  </span>
                </button>
                {expandedCowId === String(vaca.id) && (
                  <div
                    className="cow-follow-up"
                    id={`cow-follow-up-${vaca.id}`}
                  >
                    {cowSeguimientos[String(vaca.id)]?.loading ? (
                      <p className="cow-follow-up-state" role="status">
                        <span className="loading-spinner" />
                        Consultando seguimiento…
                      </p>
                    ) : cowSeguimientos[String(vaca.id)]?.error ? (
                      <p className="cow-follow-up-state is-error" role="alert">
                        {cowSeguimientos[String(vaca.id)].error}
                        <button
                          className="follow-up-retry"
                          type="button"
                          onClick={() => toggleCowSeguimiento(vaca, true)}
                        >
                          Reintentar
                        </button>
                      </p>
                    ) : !cowSeguimientos[String(vaca.id)]?.record ? (
                      <p className="cow-follow-up-state">
                        No hay seguimiento registrado para esta vaca.
                      </p>
                    ) : (
                      <dl className="cow-follow-up-grid">
                        {getSeguimientoDisplayRows(
                          cowSeguimientos[String(vaca.id)].record,
                        ).map(([label, value]) => (
                          <div className="follow-up-item" key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                )}
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
        </>
      )}

      {activeCow && (
        <section className="detail-screen" aria-labelledby="detail-title">
          <header className="detail-screen-header">
            <button
              ref={detailCloseRef}
              className="detail-back-button"
              type="button"
              onClick={closeSeguimiento}
              disabled={savingSeguimiento}
            >
              <span aria-hidden="true">←</span>
              Volver al registro
            </button>
            <span className="detail-screen-brand">
              campo<span className="brand-accent">vivo</span>
            </span>
          </header>

          <div className="detail-screen-content">
            <div className="detail-screen-heading">
              <span className="detail-cow-avatar" aria-hidden="true">🐄</span>
              <div>
                <p className="eyebrow">REGISTRO SANITARIO Y REPRODUCTIVO</p>
                <h1 id="detail-title">Seguimiento de {activeCow.name}</h1>
                <p className="detail-intro">
                  Completa los datos disponibles. Puedes volver y modificarlos
                  cuando quieras.
                </p>
              </div>
            </div>

            {loadingSeguimiento ? (
              <div className="detail-loading" role="status">
                <span className="loading-spinner" />
                <span>Cargando seguimiento…</span>
              </div>
            ) : (
              <form className="detail-form" onSubmit={saveSeguimiento}>
                <div className="detail-form-section">
                  <div className="detail-section-heading">
                    <span className="section-number">01</span>
                    <div>
                      <h2>Servicio y palpación</h2>
                      <p>Registra el servicio reproductivo y su resultado.</p>
                    </div>
                  </div>

                  <div className="detail-grid">
                    <div className="detail-field">
                      <label htmlFor="date-bred">Fecha de monta o inseminación</label>
                      <input
                        id="date-bred"
                        name="date_bred"
                        type="date"
                        value={seguimientoForm.date_bred}
                        max={today}
                        onChange={updateSeguimientoField}
                      />
                    </div>

                    <div className="detail-field">
                      <label htmlFor="type-bred">Tipo de servicio</label>
                      <select
                        id="type-bred"
                        name="type_bred"
                        value={seguimientoForm.type_bred}
                        onChange={updateSeguimientoField}
                      >
                        <option value="">Selecciona el tipo de servicio</option>
                        {SEGUIMIENTO_OPTIONS.tipoServicio.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="detail-field">
                      <label htmlFor="name-bull">Nombre del toro</label>
                      <input
                        id="name-bull"
                        name="name_bull"
                        type="text"
                        placeholder="Escribe el nombre del toro"
                        value={seguimientoForm.name_bull}
                        onChange={updateSeguimientoField}
                        maxLength={200}
                      />
                    </div>

                    <div className="detail-field">
                      <label htmlFor="date-palpation">Fecha de palpación</label>
                      <input
                        id="date-palpation"
                        name="date_palpation"
                        type="date"
                        value={seguimientoForm.date_palpation}
                        max={today}
                        onChange={updateSeguimientoField}
                      />
                    </div>

                    <div className="detail-field">
                      <label htmlFor="pregnancy-state">Resultado de palpación</label>
                      <select
                        id="pregnancy-state"
                        name="state"
                        value={seguimientoForm.state}
                        onChange={updateSeguimientoField}
                      >
                        <option value="">Selecciona el resultado</option>
                        {SEGUIMIENTO_OPTIONS.estadoPalpacion.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="detail-form-section">
                  <div className="detail-section-heading">
                    <span className="section-number">02</span>
                    <div>
                      <h2>Nacimiento y observaciones</h2>
                      <p>Completa la información de la cría cuando esté disponible.</p>
                    </div>
                  </div>

                  <div className="detail-grid">
                    <div className="detail-field">
                      <label htmlFor="date-birth">Fecha de nacimiento</label>
                      <input
                        id="date-birth"
                        name="date_birth"
                        type="date"
                        value={seguimientoForm.date_birth}
                        max={today}
                        onChange={updateSeguimientoField}
                      />
                    </div>

                    <div className="detail-field">
                      <label htmlFor="baby-sex">Sexo de la cría</label>
                      <select
                        id="baby-sex"
                        name="baby_sex"
                        value={seguimientoForm.baby_sex}
                        onChange={updateSeguimientoField}
                      >
                        <option value="">Selecciona el sexo</option>
                        {SEGUIMIENTO_OPTIONS.sexoCria.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="detail-field detail-field-wide">
                      <label htmlFor="observations">Observaciones</label>
                      <textarea
                        id="observations"
                        name="observations"
                        placeholder="Añade notas u observaciones"
                        value={seguimientoForm.observations}
                        onChange={updateSeguimientoField}
                        rows={4}
                      />
                    </div>
                  </div>
                </div>

                {seguimientoError && (
                  <p className="detail-feedback is-error" role="alert">
                    {seguimientoError}
                  </p>
                )}
                {seguimientoMessage && (
                  <p className="detail-feedback" role="status">
                    {seguimientoMessage}
                  </p>
                )}

                <div className="detail-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={closeSeguimiento}
                    disabled={savingSeguimiento}
                  >
                    Volver sin guardar
                  </button>
                  <button
                    className="add-button"
                    type="submit"
                    disabled={savingSeguimiento}
                  >
                    {savingSeguimiento ? 'Guardando…' : 'Guardar seguimiento'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      )}
    </main>
  )
}

export default App
