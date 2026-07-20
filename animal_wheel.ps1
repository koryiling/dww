<#
============================================================
  动物轮盘 概率 / 赔付 引擎  (Animal Wheel engine)
  —— 交给 PowerShell 里的 Claude 直接运行 ——
============================================================
【给 Claude 的说明 / RULES】
  你是这个轮盘游戏的荷官(dealer)。玩法:
  1) 玩家只押【8 只动物】。每只有各自赔付倍数:
        乌龟5 刺猬5 小浣5 小象5 | 猫咪10 狐狸15 猪猪25 狮子45
  2) 轮盘共 10 个落点格(8 只动物 + 菜盘 + 肉盘)，概率原始总和=102.2%，
     引擎自动归一化到 0~100 再判定落点。一把只落 1 个格。
  3) 结算:
       - 落在某只动物  => 押了它就赔 (押注×该动物倍率)
       - 落在【菜盘】  => 乌龟/刺猬/小浣/小象 里【你押过的】全部按各自倍率赔
       - 落在【肉盘】  => 猫咪/狐狸/猪猪/狮子 里【你押过的】全部按各自倍率赔
     「压几个就得到几个」——只赔你实际押过的那几只。
     例: 四只菜盘各押50，开菜盘 => 50×5×4 = 1000。
  4) 玩家可一次押任意多个，最多押满 8 只:
       - Invoke-MultiBet -AllEight -Stake 50      # 一键押满8只
       - Invoke-MultiBet -Bets @{乌龟=50;狮子=20} # 自选
     一把转盘同时结算所有注。

  常用命令:
     Show-Wheel                               # 打印落点概率/条件区间
     Invoke-Spin                              # 转一次，返回落点
     Get-Payout   -BetOn '狮子' -Stake 10     # 单押一只
     Invoke-MultiBet -AllEight -Stake 50      # 押满8只
     Test-RTP -BetOn '乌龟' -Rounds 200000    # 单押RTP
     Test-RTP-All8 -Rounds 200000             # 押满8只RTP
============================================================
#>

# ---- 8 只动物赔付倍率 (有序) ----
$Payback = [ordered]@{
    '乌龟'=5; '刺猬'=5; '小浣'=5; '小象'=5
    '猫咪'=10; '狐狸'=15; '猪猪'=25; '狮子'=45
}
$Animals = @($Payback.Keys)

# ---- 盘 -> 成员动物 ----
$Plates = @{
    '菜盘' = @('乌龟','刺猬','小浣','小象')
    '肉盘' = @('猫咪','狐狸','猪猪','狮子')
}

# ---- 轮盘 10 个落点格: 名称 / 权重(概率%) ----
$Wheel = @(
    [pscustomobject]@{ Name='乌龟'; Weight=19.4 }
    [pscustomobject]@{ Name='刺猬'; Weight=19.4 }
    [pscustomobject]@{ Name='小浣'; Weight=19.4 }
    [pscustomobject]@{ Name='小象'; Weight=19.4 }
    [pscustomobject]@{ Name='猫咪'; Weight=9.7  }
    [pscustomobject]@{ Name='狐狸'; Weight=6.5  }
    [pscustomobject]@{ Name='猪猪'; Weight=3.9  }
    [pscustomobject]@{ Name='狮子'; Weight=2.2  }
    [pscustomobject]@{ Name='菜盘'; Weight=1.5  }
    [pscustomobject]@{ Name='肉盘'; Weight=0.8  }
)

# ---- 权重 -> 累计区间 (PowerShell 可判断的 condition) ----
$Total = ($Wheel | Measure-Object Weight -Sum).Sum   # 102.2，用于归一化到0~100
$acc = 0.0
$Segments = foreach ($w in $Wheel) {
    $lo = $acc; $acc += $w.Weight
    [pscustomobject]@{
        Name = $w.Name
        Prob = [math]::Round($w.Weight / $Total * 100, 4)
        Low  = [math]::Round($lo  / $Total * 100, 6)   # Low <= roll < High
        High = [math]::Round($acc / $Total * 100, 6)
    }
}

# ---- 落点 -> 本次开出会赔哪些动物 ----
function Resolve-Winners {
    param([string]$Landed)
    if ($Animals -contains $Landed) { return @($Landed) }        # 落在某只动物
    if ($Plates.ContainsKey($Landed)) { return $Plates[$Landed] } # 落在整盘 => 该盘全体
    return @()
}

# ---- 打印条件表 ----
function Show-Wheel {
    "{0,-6} {1,-8} {2}" -f '落点','概率%','判定条件 (roll ∈ [Low,High))'
    '-' * 52
    foreach ($s in $Segments) {
        $tag = if ($Plates.ContainsKey($s.Name)) { " (整盘: $($Plates[$s.Name] -join '/'))" } else { "" }
        "{0,-6} {1,-8} {2:N4} <= roll < {3:N4}{4}" -f $s.Name, "$($s.Prob)%", $s.Low, $s.High, $tag
    }
}

# ---- 转一次: 0~100 随机数落到哪个区间就中哪个 ----
function Invoke-Spin {
    $roll = Get-Random -Minimum 0.0 -Maximum 100.0
    foreach ($s in $Segments) {
        if ($roll -ge $s.Low -and $roll -lt $s.High) {
            return [pscustomobject]@{ Roll=[math]::Round($roll,4); Name=$s.Name }
        }
    }
    return $Segments[-1]   # 浮点兜底
}

# ---- 单押一只动物 ----
function Get-Payout {
    param([Parameter(Mandatory)][string]$BetOn, [double]$Stake = 1)
    if ($Animals -notcontains $BetOn) { throw "只能押动物: $($Animals -join ', ')" }
    $spin    = Invoke-Spin
    $winners = Resolve-Winners $spin.Name
    $win = 0.0
    if ($winners -contains $BetOn) { $win = $Stake * $Payback[$BetOn] }
    [pscustomobject]@{ Roll=$spin.Roll; Landed=$spin.Name; BetOn=$BetOn; Stake=$Stake; Win=$win; Net=$win-$Stake }
}

# ---- 多点下注 / 一键押满 8 只，一把结算 ----
function Invoke-MultiBet {
    param(
        [hashtable]$Bets,          # 例: @{ 乌龟=50; 狮子=20 }
        [switch]$AllEight,         # 一键押满 8 只
        [double]$Stake = 1         # AllEight 时每只注额
    )
    if ($AllEight) { $Bets=@{}; foreach ($a in $Animals) { $Bets[$a]=$Stake } }
    if (-not $Bets -or $Bets.Count -eq 0) { throw "请用 -Bets 传入下注，或用 -AllEight 押满8只" }
    foreach ($k in $Bets.Keys) { if ($Animals -notcontains $k) { throw "只能押动物，非法: '$k'" } }

    $spin    = Invoke-Spin
    $winners = Resolve-Winners $spin.Name
    $rows = foreach ($k in $Bets.Keys) {
        $s   = [double]$Bets[$k]
        $hit = $winners -contains $k
        $win = 0.0
        if ($hit) { $win = $s * $Payback[$k] }
        [pscustomobject]@{ Spot=$k; Stake=$s; Rate="$($Payback[$k])x"; Hit=$hit; Win=$win }
    }
    $totalStake = ($Bets.Values | Measure-Object -Sum).Sum
    $totalWin   = ($rows | Measure-Object Win -Sum).Sum

    Write-Host ("落点 => {0}  (roll={1})" -f $spin.Name, $spin.Roll) -ForegroundColor Yellow
    if ($Plates.ContainsKey($spin.Name)) {
        Write-Host ("  整盘开出! 赔付该盘: {0}" -f ($Plates[$spin.Name] -join '/')) -ForegroundColor Green
    }
    $rows | Sort-Object Hit -Descending | Format-Table -AutoSize | Out-Host
    [pscustomobject]@{ Landed=$spin.Name; Roll=$spin.Roll; TotalStake=$totalStake; TotalWin=$totalWin; Net=$totalWin-$totalStake }
}

# ---- 蒙特卡洛: 单押一只 RTP ----
function Test-RTP {
    param([string]$BetOn='乌龟', [int]$Rounds=100000)
    if ($Animals -notcontains $BetOn) { throw "只能押动物" }
    $ret=0.0
    for ($i=0;$i -lt $Rounds;$i++){
        if ((Resolve-Winners (Invoke-Spin).Name) -contains $BetOn) { $ret += $Payback[$BetOn] }
    }
    [pscustomobject]@{ BetOn=$BetOn; Rounds=$Rounds; RTP=('{0:P2}' -f ($ret/$Rounds)) }
}

# ---- 蒙特卡洛: 押满8只 RTP ----
function Test-RTP-All8 {
    param([int]$Rounds=100000)
    $stake=$Animals.Count; $ret=0.0
    for ($i=0;$i -lt $Rounds;$i++){
        foreach ($a in (Resolve-Winners (Invoke-Spin).Name)) { $ret += $Payback[$a] }  # 每只押1
    }
    [pscustomobject]@{ Strategy='押满8只'; Rounds=$Rounds; RTP=('{0:P2}' -f ($ret/($stake*$Rounds))) }
}

# ================= 直接运行时的演示 =================
if ($MyInvocation.InvocationName -ne '.') {
    Write-Host "`n===== 落点概率 / 条件区间 =====" -ForegroundColor Cyan
    Show-Wheel
    Write-Host "`n===== 一键押满 8 只(每只50) =====" -ForegroundColor Cyan
    Invoke-MultiBet -AllEight -Stake 50 | Format-List
}
