cd

rm .bash_profile
ln -s .dotfiles/bash_profile .bash_profile

rm .inputrc
ln -s .dotfiles/inputrc .inputrc

rm .vimrc
ln -s .dotfiles/vimrc .vimrc

rm .minttyrc
ln -s .dotfiles/minttyrc .minttyrc

rm .screenrc
ln -s .dotfiles/screenrc .screenrc

rm .inputrc
ln -s .dotfiles/inputrc .inputrc

#cp minttyrc  /mnt/c/Users/jcouv/AppData/Roaming/wsltty/config

git config --global user.name "Julien Couvreur"
git config --global user.email "jcouv@microsoft.com"
git config --global core.editor "vim"
git config --global credential.helper 'cache --timeout 360000'

