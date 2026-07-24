import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function StepTypeSelect({ value, onChange, options, dotColors, disabled }) {
    const [open, setOpen] = useState(false)
    const [coords, setCoords] = useState(null)
    const buttonRef = useRef(null)
    const menuRef = useRef(null)

    const openMenu = () => {
        const rect = buttonRef.current.getBoundingClientRect()
        setCoords({ top: rect.bottom + 4, left: rect.left })
        setOpen(true)
    }

    useEffect(() => {
        if (!open) return
        const onClickOutside = (e) => {
            if (buttonRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
            setOpen(false)
        }
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
        const onScroll = () => setOpen(false)
        document.addEventListener('mousedown', onClickOutside)
        document.addEventListener('keydown', onKey)
        window.addEventListener('scroll', onScroll, true)
        return () => {
            document.removeEventListener('mousedown', onClickOutside)
            document.removeEventListener('keydown', onKey)
            window.removeEventListener('scroll', onScroll, true)
        }
    }, [open])

    return (
        <>
            <button ref={buttonRef} type="button" disabled={disabled} onClick={() => (open ? setOpen(false) : openMenu())}
                className="flex items-center justify-between gap-1.5 w-28 bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-sm font-medium text-gray-700 hover:border-gray-300 focus:outline-none focus:border-blue-500 disabled:opacity-50 cursor-pointer shrink-0">
                <span className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[value]}`} />
                    <span className="truncate">{options[value]}</span>
                </span>
                <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            {open && coords && createPortal(
                <div ref={menuRef} style={{ position: 'fixed', top: coords.top, left: coords.left }}
                    className="z-50 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1.5 overflow-hidden">
                    {Object.entries(options).map(([val, label]) => (
                        <button key={val} type="button" onClick={() => { onChange(val); setOpen(false) }}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${val === value ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[val]}`} />
                            {label}
                            {val === value && (
                                <svg className="w-3.5 h-3.5 ml-auto text-blue-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            )}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </>
    )
}
