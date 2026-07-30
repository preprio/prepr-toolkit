import classNames from 'classnames'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  buttonStyle?: 'primary' | 'secondary'
  className?: string
}

export default function Button(props: ButtonProps)  {
  const { children, buttonStyle = 'primary', className, ...additionalProps } = props
  const classes = classNames(
    'flex rounded-full text-sm px-6 py-2.5 font-medium',
    buttonStyle === 'primary' && 'bg-primary-600 hover:bg-primary-700 text-white',
    buttonStyle === 'secondary' && 'bg-white hover:bg-gray-50 text-secondary-700',
    className
  )

  return (
    <button className={classes} {...additionalProps}>
      {children}
    </button>
  )
}