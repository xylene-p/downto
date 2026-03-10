import React, { forwardRef, TextareaHTMLAttributes } from 'react';

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

const TextArea: React.FC<TextAreaProps> = forwardRef<
  HTMLTextAreaElement,
  TextAreaProps
>((props, ref) => {
  return (
    <textarea
      className="focus:border-dt w-full resize-none rounded-xl border border-solid border-neutral-800 bg-neutral-900 p-4 font-mono text-lg text-white outline-0 transition-all placeholder:text-neutral-700"
      ref={ref}
      {...props}
    />
  );
});

export default TextArea;
