# base-files version 4.2-3

# source the users bashrc if it exists
if [ -f "${HOME}/.bashrc" ] ; then
  source "${HOME}/.bashrc"
fi

for DOTFILE in `find ~/.dotfiles/bash/*.bash`; do
  [ -f "$DOTFILE" ] && source "$DOTFILE"
done

alias repos='cd /d/repos/'
alias issues='cd /d/issues/'
alias ..='cd ..'
alias roslyn-build='msbuild /v:m /m Roslyn.sln'
alias roslyn-test='msbuild /v:m /m /t:test BuildAndTest.proj'
alias roslyn-restore='./Restore.cmd'
alias roslyn-ide='devenv /rootsuffix RoslynDev'
alias :q=exit
alias ildasm='/c/Program\ Files\ \(x86\)/Microsoft\ SDKs/Windows/v10.0A/bin/NETFX\ 4.6.1\ Tools/ildasm.exe'
alias :qa!='screen -X "quit"'
alias :qa='echo "Confirm with :qa!"'

alias csc-roslyn3='/d/repos/roslyn3/Binaries/Debug/csc.exe'
alias csc-roslyn2='/d/repos/roslyn2/Binaries/Debug/csc.exe'
alias csc-roslyn='/d/repos/roslyn/Binaries/Debug/csc.exe'
alias csc-native='/c/Windows/Microsoft.NET/Framework/v4.0.30319/csc.exe'
alias csc-vs='/c/Program\ Files\ \(x86\)/MSBuild/14.0/Bin/csc.exe'

alias vbc-roslyn3='/d/repos/roslyn3/Binaries/Debug/vbc.exe'
alias vbc-roslyn2='/d/repos/roslyn2/Binaries/Debug/vbc.exe'
alias vbc-roslyn='/d/repos/roslyn/Binaries/Debug/vbc.exe'
alias vbc-native='/c/Windows/Microsoft.NET/Framework/v4.0.30319/vbc.exe'
alias vbc-vs='/c/Program\ Files\ \(x86\)/MSBuild/14.0/Bin/vbc.exe'

alias ilspy='/c/Users/jcouv/bin/ILSpy/ILSpy.exe'
alias fuslogvw='/c/Program\ Files\ \(x86\)/Microsoft\ SDKs/Windows/v10.0A/bin/NETFX\ 4.6.1\ Tools/FUSLOGVW.exe'
alias windbg='/c/Program\ Files\ \(x86\)/Debugging\ Tools\ for\ Windows\ \(x86\)/windbg.exe'
alias perfview='//clrmain/tools/PerfView.exe'

alias g='git'
alias gd='git diff'
alias gs='git status'

# Key bindings to manipulate screen in bash vi-mode
# bind -x specifies commands to execute in the background
bind -m vi -x '"t":"screen -X screen"'
bind -m vi -x '"J":"screen -X prev"'
bind -m vi -x '"K":"screen -X next"'

function do_git {
  cmd=$1
  shift
  extra=""
  if [ "$cmd" == "add" ]; then
    extra="-v"
  elif [ "$cmd" == "rm" ]; then
    extra="--cached"
  fi
  "`which git`" "$cmd" "$extra" "$@"
}
#alias  git='do_git'

export PERL5LIB=/usr/lib/perl5/vendor_perl/5.22

