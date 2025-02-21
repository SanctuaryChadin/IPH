import localFont from 'next/font/local'

export const sukhumvit = localFont({
  src: [
    {
    path: './SukhumvitSet-Thin.woff2',
    weight: '100',
    style: 'normal',
    },
    {
    path: './SukhumvitSet-Light.woff2',
    weight: '300',
    style: 'normal',
    },
    {
      path: './SukhumvitSet-Text.woff2',
      weight: '400',
      style: 'normal',
    },
    {
        path: './SukhumvitSet-Medium.woff2',
        weight: '500',
        style: 'normal',
    },
    {
      path: './SukhumvitSet-SemiBold.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: './SukhumvitSet-Bold.woff2',
      weight: '700',
      style: 'normal',
    }
  ],
  variable: '--sukhumvit-font',
  display: 'swap',
})
