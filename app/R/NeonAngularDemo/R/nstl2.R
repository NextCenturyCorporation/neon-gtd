#############################################################################
#                                                                           #
#  Copyright 2016 Next Century Corporation                                  #
#  Licensed under the Apache License, Version 2.0 (the "License");          #
#  you may not use this file except in compliance with the License.         #
#  You may obtain a copy of the License at                                  #
#                                                                           #
#      http://www.apache.org/licenses/LICENSE-2.0                           #
#                                                                           #
#  Unless required by applicable law or agreed to in writing, software      #
#  distributed under the License is distributed on an "AS IS" BASIS,        #
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. #
#  See the License for the specific language governing permissions and      #
#  limitations under the License.                                           #
#                                                                           #
############################################################################

nstl2 <-
function(x,n.p,t.degree,t.window,s.window,s.degree,outer) {
require(stl2)
fit <- stl2(x,n.p=n.p, t.degree=t.degree, t.window=t.window, s.window=s.window, s.degree=s.degree, outer=outer)
fit$data
}
