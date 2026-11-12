import Icono from './Icono';

export default function LoginView({
  sesionLista,
  usuario,
  verificandoRol,
  rol,
  tema,
  correo,
  setCorreo,
  contrasena,
  setContrasena,
  iniciarSesion,
  cerrarSesion,
  error,
}) {
  if (!sesionLista) {
    return (
      <main className={`gps-app theme-${tema} login-loading`}>
        <div className="loading-indicator" />
        <p>Comprobando sesión...</p>
      </main>
    );
  }

  if (!usuario) {
    return (
      <main className={`gps-app theme-${tema} login-page`}>
        <section className="login-card">
          <div className="brand-lockup login-brand">
            <div className="brand-symbol">
              <Icono nombre="pin" tamano={24} />
            </div>
            <div>
              <div className="brand-name">Nexo GPS</div>
              <div className="brand-caption">Plataforma de monitoreo</div>
            </div>
          </div>

          <div className="login-heading">
            <p className="eyebrow">ACCESO SEGURO</p>
            <h1>Iniciar sesión</h1>
            <p>Accede al panel de seguimiento y administración de ubicaciones.</p>
          </div>

          <form onSubmit={iniciarSesion} className="login-form">
            <label htmlFor="correo">Correo electrónico</label>
            <input
              id="correo"
              type="email"
              required
              autoComplete="email"
              placeholder="nombre@correo.com"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
            />

            <label htmlFor="contrasena">Contraseña</label>
            <input
              id="contrasena"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Introduce tu contraseña"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
            />

            <button type="submit" className="button button-primary login-submit">
              Iniciar sesión
            </button>
          </form>

          {error && <div className="alert alert-error">{error}</div>}

          <p className="login-footnote">
            El acceso al panel está limitado a cuentas autorizadas.
          </p>
        </section>
      </main>
    );
  }

  if (verificandoRol) {
    return (
      <main className={`gps-app theme-${tema} login-loading`}>
        <div className="loading-indicator" />
        <p>Verificando permisos de acceso...</p>
      </main>
    );
  }

  if (rol !== 'admin') {
    return (
      <main className={`gps-app theme-${tema} login-page`}>
        <section className="login-card access-denied">
          <div className="brand-symbol">
            <Icono nombre="pin" tamano={24} />
          </div>
          <h1>Acceso restringido</h1>
          <p>Esta cuenta no tiene permisos de administrador para acceder al panel.</p>
          {error && <div className="alert alert-error">{error}</div>}
          <button onClick={cerrarSesion} className="button button-secondary">
            <Icono nombre="logout" tamano={17} />
            Cerrar sesión
          </button>
        </section>
      </main>
    );
  }

  return null;
}