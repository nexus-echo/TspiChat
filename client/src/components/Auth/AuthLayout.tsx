import { ThemeSelector } from '@librechat/client';
import { TStartupConfig } from 'librechat-data-provider';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { TranslationKeys, useLocalize } from '~/hooks';
import SocialLoginRender from './SocialLoginRender';
import { BlinkAnimation } from './BlinkAnimation';
import { Banner } from '../Banners';
import Footer from './Footer';

function AuthLayout({
  children,
  header,
  isFetching,
  startupConfig,
  startupConfigError,
  pathname,
  error,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  isFetching: boolean;
  startupConfig: TStartupConfig | null | undefined;
  startupConfigError: unknown | null | undefined;
  pathname: string;
  error: TranslationKeys | null;
}) {
  const localize = useLocalize();

  const hasStartupConfigError = startupConfigError !== null && startupConfigError !== undefined;
  const DisplayError = () => {
    if (hasStartupConfigError) {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>{localize('com_auth_error_login_server')}</ErrorMessage>
        </div>
      );
    } else if (error === 'com_auth_error_invalid_reset_token') {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>
            {localize('com_auth_error_invalid_reset_token')}{' '}
            <a
              className="font-semibold text-accent-primary hover:underline"
              href="/forgot-password"
            >
              {localize('com_auth_click_here')}
            </a>{' '}
            {localize('com_auth_to_try_again')}
          </ErrorMessage>
        </div>
      );
    } else if (error != null && error) {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>{localize(error)}</ErrorMessage>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-surface-primary">
      <Banner />
      <DisplayError />
      <div className="absolute bottom-0 left-0 md:m-4">
        <ThemeSelector />
      </div>

      <main className="flex flex-grow items-center justify-center">
        <div className="w-authPageWidth overflow-hidden bg-surface-primary px-6 py-4 sm:max-w-md sm:rounded-lg">
          {/* TSPI: logo sits directly above the heading instead of pinned to the top of the page */}
          <BlinkAnimation active={isFetching}>
            <div className="mb-6 flex w-full justify-center">
              <img
                src="assets/logo.svg"
                className="h-16 w-16 object-contain"
                alt={localize('com_ui_logo', { 0: startupConfig?.appTitle ?? 'TSPI Digital' })}
              />
            </div>
          </BlinkAnimation>
          {!hasStartupConfigError && !isFetching && header && (
            <h1
              className="mb-4 text-center text-3xl font-semibold text-text-primary"
              style={{ userSelect: 'none' }}
            >
              {header}
            </h1>
          )}
          {children}
          {!pathname.includes('2fa') &&
            (pathname.includes('login') || pathname.includes('register')) && (
              <SocialLoginRender startupConfig={startupConfig} />
            )}
          {/* TSPI: accounts are created in WorkOS, so "Sign up" opens the WorkOS sign-up screen */}
          {pathname.includes('login') &&
            startupConfig?.openidLoginEnabled === true &&
            startupConfig?.registrationEnabled !== true && (
              <p className="my-4 text-center text-sm font-light text-text-secondary">
                {localize('com_auth_no_account')}{' '}
                <a
                  href={`${startupConfig.serverDomain}/oauth/openid?screen_hint=sign-up`}
                  className="inline-flex p-1 text-sm font-medium text-accent-primary underline decoration-transparent transition-all duration-200 hover:text-accent-primary-hover hover:decoration-accent-primary-hover"
                >
                  {localize('com_auth_sign_up')}
                </a>
              </p>
            )}
        </div>
      </main>
      <Footer startupConfig={startupConfig} />
    </div>
  );
}

export default AuthLayout;
