# Kaiju — vérifie et ouvre le port du serveur dans le pare-feu Windows (profil Privé uniquement).
# À lancer dans PowerShell **en administrateur** :
#   powershell -ExecutionPolicy Bypass -File .\windows-firewall.ps1 -Port 3000
# Ce script ne désactive jamais le pare-feu et ne change pas le profil réseau sans confirmation.
param(
  [int]$Port = 3000
)

$ruleName = "Kaiju TCP $Port (Prive)"

Write-Host "Profils des réseaux actifs :"
Get-NetConnectionProfile | Format-Table Name, InterfaceAlias, NetworkCategory -AutoSize

$public = Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq 'Public' }
if ($public) {
  Write-Warning "Au moins un réseau est en profil Public : la règle (profil Privé) ne s'y appliquera pas."
  foreach ($p in $public) {
    $answer = Read-Host "Passer '$($p.Name)' ($($p.InterfaceAlias)) en Privé ? Faites-le seulement pour un réseau de confiance (o/N)"
    if ($answer -match '^[oOyY]') {
      Set-NetConnectionProfile -InterfaceIndex $p.InterfaceIndex -NetworkCategory Private
      Write-Host "  -> '$($p.Name)' est maintenant en Privé."
    }
  }
}

$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "La règle '$ruleName' existe déjà."
} else {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private | Out-Null
  Write-Host "Règle créée : '$ruleName' (entrant, TCP $Port, profil Privé)."
}

Write-Host "`nPour supprimer la règle après la séance :"
Write-Host "  Remove-NetFirewallRule -DisplayName '$ruleName'"
