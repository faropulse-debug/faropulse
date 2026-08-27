# scripts/setup-worktree.ps1
# Crea un git worktree aislado para que cada agente trabaje sin colisionar en Windows / PowerShell.
param(
  [Parameter(Mandatory=$true, Position=0)]
  [string]$Branch,
  
  [Parameter(Mandatory=$false, Position=1)]
  [string]$BaseRef = "origin/develop"
)

$ErrorActionPreference = "Stop"

$safeDirName = $Branch -replace '/', '-'
$repoRoot = (git rev-parse --show-toplevel).Trim()
$worktreeBase = Join-Path (Split-Path $repoRoot -Parent) "faro-app-worktrees"
$worktreePath = Join-Path $worktreeBase $safeDirName

Write-Host "[WORKTREE] Verificando estado del repositorio..." -ForegroundColor Cyan
git fetch --all --prune | Out-Null

if (Test-Path $worktreePath) {
  Write-Host "[ERROR] El worktree ya existe en: $worktreePath" -ForegroundColor Red
  Write-Host "Si deseas eliminarlo, ejecuta: git worktree remove `"$worktreePath`"" -ForegroundColor Yellow
  exit 1
}

New-Item -ItemType Directory -Path $worktreeBase -Force | Out-Null

Write-Host "[WORKTREE] Creando worktree en: $worktreePath ..." -ForegroundColor Cyan

$localBranchExists = git rev-parse --verify $Branch 2>$null
$remoteBranchExists = git rev-parse --verify "origin/$Branch" 2>$null

if ($localBranchExists) {
  git worktree add $worktreePath $Branch
} elseif ($remoteBranchExists) {
  git worktree add --track -b $Branch $worktreePath "origin/$Branch"
} else {
  git worktree add -b $Branch $worktreePath $BaseRef
}

foreach ($envFile in @('.env.staging', '.env.stg-test-users', '.env.local')) {
  $src = Join-Path $repoRoot $envFile
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $worktreePath $envFile)
  }
}

$rootNodeModules = Join-Path $repoRoot "node_modules"
$wtNodeModules = Join-Path $worktreePath "node_modules"
if ((Test-Path $rootNodeModules) -and -not (Test-Path $wtNodeModules)) {
  cmd /c mklink /j `"$wtNodeModules`" `"$rootNodeModules`" | Out-Null
}

Write-Host ""
Write-Host "[OK] Worktree creado con exito en:" -ForegroundColor Green
Write-Host "Path: $worktreePath" -ForegroundColor Green
Write-Host ""
Write-Host "Para comenzar a trabajar:" -ForegroundColor Cyan
Write-Host "  cd `"$worktreePath`""
Write-Host "  git branch --show-current"
