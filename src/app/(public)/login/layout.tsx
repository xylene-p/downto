import './global.css';

export default function LoginLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className='container'>
            <main>
            {children}
            </main>
        </div>
    )
}