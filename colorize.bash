#!/bin/bash

# based on http://stackoverflow.com/questions/5947742/how-to-change-the-output-color-of-echo-in-linux 

while read LINE
do
   if [[ $LINE == *"error"* ]]
   then
      tput setaf 1
   fi
   if [[ $LINE == *"warning"* ]]
   then
      tput setaf 3
   fi
   
   echo $LINE
   tput sgr0
done

