import clsx from 'clsx'

import styles from './DownToLogo.module.css'

interface DownToLogoProps {
    size?: 'small' | 'display'
}

export default function DownToLogo({ size = 'small' }: DownToLogoProps) {
    return (
        <p className={clsx(styles.logo, styles[size])}>down to</p>
    )
}