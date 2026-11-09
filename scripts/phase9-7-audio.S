/* CC0: independent OPL carrier + SB16 DMA sine; no game code/data.
   GNU as --32, ld -m elf_i386 -Ttext 0x100 --oformat binary.
   Press O for OPL, P for PCM, Q to exit. Capture before selecting. */
.code16
.intel_syntax noprefix
.global _start
_start:
 push cs
 pop ds
 mov dx, offset ready
 mov ah, 9
 int 0x21
 xor ah, ah
 int 0x16
 cmp al, 'q'
 je exit
 cmp al, 'o'
 je opl
 cmp al, 'p'
 je pcm
 jmp _start
exit:
 mov ax, 0x4c00
 int 0x21
opl:
 mov dx, offset opltext
 mov ah, 9
 int 0x21
 mov si, offset regs
 mov cx, 12
1:
 lodsw
 call oplwrite
 loop 1b
 mov bx, 36
 call waitticks
 mov ax, 0x11b0
 call oplwrite
 mov bx, 9
 call waitticks
 jmp done
oplwrite:
 push cx
 mov dx, 0x388
 out dx, al
 mov cx, 6
2: in al, dx
 loop 2b
 inc dx
 mov al, ah
 out dx, al
 dec dx
 mov cx, 35
3: in al, dx
 loop 3b
 pop cx
 ret
pcm:
 mov dx, offset pcmtext
 mov ah, 9
 int 0x21
 /* Place 8000-byte sample at next physical 64KiB boundary inside the
    COM allocation, avoiding DMA page wrap. No file or persistent writes. */
 mov ax, cs
 add ax, 0x1000
 and ax, 0xf000
 mov es, ax
 xor di, di
 mov si, offset sine
 mov cx, 8000
 cld
 rep movsb
 mov dx, 0x226
 mov al, 1
 out dx, al
 mov cx, 1000
4: loop 4b
 xor al, al
 out dx, al
 mov dx, 0x22e
5: in al, dx
 test al, 0x80
 jz 5b
 mov dx, 0x22a
 in al, dx
 cmp al, 0xaa
 jne exit
 mov al, 0xd1
 call dsp
 mov al, 0x41
 call dsp
 mov al, 0x1f
 call dsp
 mov al, 0x40
 call dsp
 /* Mask DMA1, clear flip-flop, memory-to-device single cycle. */
 mov al, 5
 out 0x0a, al
 xor al, al
 out 0x0c, al
 mov al, 0x49
 out 0x0b, al
 xor al, al
 out 2, al
 out 2, al
 mov ax, es
 mov cl, 12
 shr ax, cl
 out 0x83, al
 mov ax, 7999
 out 3, al
 mov al, ah
 out 3, al
 mov al, 1
 out 0x0a, al
 mov al, 0xc0
 call dsp
 xor al, al
 call dsp
 mov al, 0x3f
 call dsp
 mov al, 0x1f
 call dsp
 mov bx, 30
 call waitticks
 mov dx, 0x22e
 in al, dx
 mov al, 0xd3
 call dsp
 jmp done
dsp:
 push ax
 mov dx, 0x22c
6: in al, dx
 test al, 0x80
 jnz 6b
 pop ax
 out dx, al
 ret
waitticks:
 push es
 mov ax, 0x40
 mov es, ax
 mov bp, word ptr es:[0x6c]
7: mov ax, word ptr es:[0x6c]
 sub ax, bp
 cmp ax, bx
 jb 7b
 pop es
 ret
done:
 mov dx, offset donetext
 mov ah, 9
 int 0x21
 jmp _start
ready: .ascii "AUDIO_READY O=OPL P=PCM Q=EXIT\r\n$"
opltext: .ascii "AUDIO_OPL_BEGIN\r\n$"
pcmtext: .ascii "AUDIO_PCM_BEGIN\r\n$"
donetext: .ascii "AUDIO_DONE\r\n$"
/* Reg/value pairs, carrier only, FNUM580/block4: ~440Hz. */
regs: .byte 1,32, 0x20,1, 0x23,1, 0x40,63, 0x43,0, 0x60,0xf0, 0x63,0xf0, 0x80,0x77, 0x83,0x77, 0xc0,0, 0xa0,0x44, 0xb0,0x32
sine:
 .rept 1000
 .byte 128,185,208,185,128,71,48,71
 .endr
