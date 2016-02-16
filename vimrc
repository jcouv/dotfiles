" Includes many tricks from http://stackoverflow.com/questions/164847/what-is-in-your-vimrc

" Necesary  for lots of cool vim things
set nocompatible
" This shows what you are typing as a command.  I love this!
set showcmd
" Who doesn't like autoindent?
set autoindent

" Spaces are better than a tab character
set expandtab
set smarttab

" Who wants an 8 character tab?  Not me!
set shiftwidth=3
set softtabstop=3
" Line Numbers PWN!
set number

" Incremental searching is sexy
set incsearch

" Highlight things that we find with the search
set hlsearch

" When I close a tab, remove the buffer
set nohidden

" Highlight current line
set cul

set scrolloff=5               " keep at least 5 lines above/below
set sidescrolloff=5           " keep at least 5 lines left/right

set shell=bash
set showmode
set autoread                  " watch for file changes
set ignorecase          " Do case insensitive matching

set wrap
set linebreak
set nolist              " list disables linebreak
set textwidth=0
set wrapmargin=0
autocmd FileType text setlocal textwidth=0

" allow backspacing over everything in insert mode
set backspace=indent,eol,start

iab --- --------------------------

" Next Tab
nnoremap <silent> <C-Right> :tabnext<CR>

" Previous Tab
nnoremap <silent> <C-Left> :tabprevious<CR>

" New Tab
nnoremap <silent> <C-t> :tabnew<CR>

" Make cursor move as expected with wrapped lines:
inoremap <Down> <C-o>gj
inoremap <Up> <C-o>gk

" This is totally awesome - remap jj to escape in insert mode.  You'll never type jj anyway, so it's great!
inoremap jj <Esc>
nnoremap JJJJ <Nop>
nnoremap <Tab> <Esc>
vnoremap <Tab> <Esc>gV
onoremap <Tab> <Esc>
inoremap <Tab> <Esc>`^
inoremap <Leader><Tab> <Tab>

"This unsets the "last search pattern" register by hitting return
nnoremap <CR> :noh<CR><CR>

" CTRL-s to save
nnoremap <silent> <C-s> :write<CR>

