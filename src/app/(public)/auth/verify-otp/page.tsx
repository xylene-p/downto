'use client';

import Button from '@/components/ui/Button';
import FormInput from '@/components/ui/Form/FormInput';
import { verifyOtp } from '@/lib/auth';
import Form from 'next/form';
import { startTransition, use, useActionState, useState } from 'react';

import Link from 'next/link';
import LinkButton from '@/components/ui/LinkButton';
import { resendOtp } from '@/lib/auth';

/**
 * Page handles OTP entry, verification, and resend
 */
export default function VerifyOtpPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [verifyError, verifyAction, verifyPending] = useActionState(
    verifyOtp,
    null
  );
  const [resendError, resendAction] = useActionState(resendOtp, null);
  const [otp, setOtp] = useState('');

  const email = use(searchParams).email as string;

  const handleResend = () => {
    // Immediately reset form state
    setOtp('');

    startTransition(async () => {
      await resendAction(email);
    });
  };

  if (email) {
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
          <Link href="/login" className="text-neutral-500 underline">
            Different email
          </Link>
          <LinkButton onClick={handleResend}>Resend code</LinkButton>
        </div>
      </div>
    );
  }
}
