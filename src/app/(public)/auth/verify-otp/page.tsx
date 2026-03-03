'use client';

import Button from '@/components/ui/Button';
import FormInput from '@/components/ui/Form/FormInput';
import { verifyOtp } from '@/lib/auth';
import Form from 'next/form';
import {
  startTransition,
  Suspense,
  use,
  useActionState,
  useState,
} from 'react';

import Link from 'next/link';
import LinkButton from '@/components/ui/LinkButton';
import { resendOtp } from '@/lib/auth';
import { redirect, useSearchParams } from 'next/navigation';

function VerifyOtp() {
  const [verifyError, verifyAction, verifyPending] = useActionState(
    verifyOtp,
    null
  );
  const [resendError, resendAction] = useActionState(resendOtp, null);
  const [otp, setOtp] = useState('');

  const searchParams = useSearchParams();
  const email = searchParams.get('email');

  if (!email) {
    redirect('/login');
  }

  const handleResend = () => {
    // Immediately reset form state
    setOtp('');

    startTransition(async () => {
      await resendAction(email);
    });
  };

  return (
    <div className="flex flex-col">
      {verifyError && (
        <div className="mb-5">
          <p className="text-red-500">{verifyError}</p>
        </div>
      )}

      {resendError && (
        <div className="mb-5">
          <p className="text-red-500">{resendError}</p>
        </div>
      )}

      <div className="mb-5">
        <p>
          We sent a code to
          <br />
          <span className="text-dt">{email}</span>
        </p>
      </div>

      <Form action={verifyAction}>
        <FormInput type="hidden" name="email" value={email} />
        <FormInput
          label="Code"
          name="code"
          inputMode="numeric"
          onChange={(e) =>
            setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))
          }
          value={otp}
          placeholder="00000000"
          autoFocus
          autoComplete="one-time-code"
          required
          inputClassName="text-2xl text-center tracking-[0.3rem]"
        />
        <Button
          type="submit"
          size="large"
          disabled={otp.length !== 8 || verifyPending}
          fullWidth
        >
          {verifyPending ? 'Verifying...' : 'Verify'}
        </Button>
      </Form>
      <div className="mt-3 flex justify-center gap-4">
        <Link href="/login" className="text-xs text-neutral-700 underline">
          Different email
        </Link>
        <LinkButton onClick={handleResend}>Resend code</LinkButton>
      </div>
    </div>
  );
}

/**
 * Page handles OTP entry, verification, and resend
 */
export default function VerifyOtpPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VerifyOtp />
    </Suspense>
  );
}
