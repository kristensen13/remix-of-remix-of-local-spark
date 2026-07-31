namespace LocaleBoost.Api.Data.Entities;

public enum TipoLinea
{
    ServicioPorHoras,
    ServicioPrecioFijo,
    Suscripcion,
    Producto
}

public enum TipoIva
{
    General21,
    Reducido10,
    Superreducido4,
    Exento
}

public enum EstadoPresupuesto
{
    Borrador,
    Enviado,
    Aceptado,
    Rechazado,
    Caducado
}

public enum EstadoFactura
{
    Emitida,
    Cobrada,
    Anulada,
    Rectificada
}
