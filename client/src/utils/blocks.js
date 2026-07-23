export const buildBlocks = (sequence) => {
    if (!sequence?.length) return []
    const result = []
    let runCursor = 0
    for (const item of sequence) {
        if (item.type === 'analyse') {
            const count = Number(item.intervals) || 0
            if (count <= 0) continue
            const startRun = runCursor + 1
            const endRun = runCursor + count
            result.push({ index: result.length + 1, startRun, endRun })
            runCursor += count
        }
    }
    return result
}

// Real elapsed seconds since the session's first sample, derived from the actual
// captured timestamps rather than assumed from intervalTime × run index — accurate
// even when a session mixes multiple Analyse blocks with different interval times,
// or has action steps burning real time in between.
export const elapsedSeconds = (runtimeData, sample) => {
    if (!runtimeData?.length || !sample) return 0
    return +(((new Date(sample.timestamp) - new Date(runtimeData[0].timestamp)) / 1000).toFixed(2))
}

// Annotates each block with:
//  - `x`: elapsed seconds positioned midway between the last sample of the previous
//    block and the first sample of this one, for drawing a divider line on a
//    time-based chart axis.
//  - `startTime`/`endTime`: real elapsed seconds of this block's first/last *actually
//    captured* sample — clamped to runtimeData rather than trusting the declared
//    startRun/endRun, so a block cut short by the Total Duration deadline (its
//    declared range extends past what was really captured) shows the real partial
//    range instead of a reversed/zeroed one. A block with no captured samples at all
//    (never reached before the deadline) is dropped rather than shown as broken.
export const withTiming = (blocks, runtimeData) =>
    blocks
        .map(block => {
            const samplesInBlock = runtimeData?.filter(r => r.run >= block.startRun && r.run <= block.endRun) ?? []
            if (samplesInBlock.length === 0) return null
            const startSample = samplesInBlock[0]
            const endSample   = samplesInBlock[samplesInBlock.length - 1]
            const prevSample  = runtimeData?.find(r => r.run === block.startRun - 1)
            const startX = elapsedSeconds(runtimeData, startSample)
            const x = prevSample ? (startX + elapsedSeconds(runtimeData, prevSample)) / 2 : startX
            return { ...block, x, startTime: startX, endTime: elapsedSeconds(runtimeData, endSample) }
        })
        .filter(Boolean)

// Formats a duration in seconds as "45s" or "5m 20s" — used for both chart
// axes/tooltips (long Live Sessions can run many minutes) and duration inputs.
export const formatElapsed = (totalSeconds) => {
    const s = Math.round(totalSeconds)
    if (s < 60) return `${s}s`
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
}
