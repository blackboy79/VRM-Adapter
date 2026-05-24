# Victron VRM Dashboard

Modernes Victron VRM/ESS Dashboard für ioBroker mit klassischer Konfiguration und Premium-Webansicht.

## Installation über ioBroker Admin

1. ioBroker Admin öffnen
2. Adapter öffnen
3. GitHub/URL installieren wählen
4. Benutzerdefinierte URL einfügen:

```text
https://github.com/blackboy79/VRM-Adapter.git
```

## Installation per Konsole

```bash
cd /opt/iobroker
iobroker url https://github.com/blackboy79/VRM-Adapter.git
```

## Web-Dashboard

Nach der Installation ist das Dashboard über den ioBroker-Webadapter erreichbar:

```text
http://IOBROKER-IP:8082/victron-vrm-dashboard/
```

## Konfiguration

In der Adapterinstanz eintragen:

- VRM Access Token
- VRM Site ID
- Polling-Intervall
- Tag-/Nachtbild
- manuelle Datenpunkte
- PV-Strings
- Verbraucher
- freie Dashboard-Karten

## Hinweise

Der VRM Access Token wird nicht im Repository gespeichert. Nach der Installation muss jeder Nutzer seinen eigenen Token und seine eigene Site ID in der Instanz eintragen.

## Lizenz

MIT
