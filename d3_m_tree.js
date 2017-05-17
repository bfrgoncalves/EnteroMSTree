D3MSTree.prototype = Object.create(D3BaseTree.prototype);
D3MSTree.prototype.constructor = D3MSTree;

/**
* @typedef {Object} InitialData
* @property {list} -a load of nodes
*
*/

/**
* @constructor
* @extends D3BaseTree
* @param {string} element_id - The id of the container for the tree
* @param {InitialData} data -An  object containing the following 
*<ul>
*  <li>metadata- An object of metadata id  to key/value metadata e.g {23:{"strain":"bob","country":"Egypt",ID:"ST131"},....} </li>
* <li>nodes - A list of node names ['ST131','ST11'] if the node represents a hypothetical node then the name should be  'hypothetical_node' </li>
*  <li> links  - A list of source / target / values , where source and targets are indexes to the nodes list e.g. [{source:0,target:1,value:10},...]</li>
* <li> layoutdata - An object containing the layoudata
* </ul>
* @param {function} callback The function to be called when the set up is finished (optional)
* @param {integer} height - the initial height (optional)
* @param {integer} width - the initial width  (optional)
*/
function D3MSTree(element_id,data,callback,height,width){
        D3BaseTree.call(this,element_id,data['metadata'],height,width);
        var self =this;
    
        //d3 force parameters
        this.charge=0;
        this.maxChargeDistance=2000;
        this.gravity=0.0;
            
        //label parameters
        this.base_font_size=10;
        this.show_node_labels=true;
        this.node_font_size=14;
        this.link_font_size=10;
        this.log_link_scale=false;
        this.fixed_mode=true;
        this.node_radii={};
        this.previous_node_radii={};
        //Any link with a value above this will have be as long as _max_link_scale
        this.max_link_length=10000;
        //the length in pixels of the longest link
        this.max_link_scale=500;
        this.hide_link_length=10000;
        if (data['hide_link_length']){
                this.hide_link_length  = data['hide_link_length'];
        }
        this.show_link_labels=true;
        
        this.distance_scale= d3.scale.linear().domain([0,this.max_link_distance]).range([0,this.max_link_scale]);

        this.show_individual_segments=false;
        //node sizes and log scale
        this.size_power=0.41;
        this.base_node_size=10;
        this.update_graphics=true;
      
        
        this.precompute=true;
        
        
        this.pie = d3.layout.pie().sort(null).value(function(it){
                return it.value;
        });
      
        if (data['initial_category']){
                this.display_category=data['initial_category'];
        }
        this.arc = this._calculateArc();
     
    
        this.d3_force_directed_graph = d3.layout.force();
        
        //dragging operations
        this.initial_drag_angle=0;
        this.drag_source=0;
        this.drag_link = null;
        this.drag_orig_xy = [0,0];
        
        this.force_drag = this.d3_force_directed_graph.drag()
        .on('dragstart', function(it){
              self._dragStarted(it);
       })         
        .on('drag', function(it){
              self._dragging(it)
       })
        .on('dragend',function(it){
              self._dragEnded(it)
       });
                
        
        this.force_nodes = this.d3_force_directed_graph.nodes();
        this.force_links = this.d3_force_directed_graph.links();
        if (data['nexus']){
                this.temp_nodes=[];
                this.temp_links=[];
                var root = this.readNexusFile(data['nexus']);
                this.createLinksFromNewick(root);
                this._addNodes(this.temp_nodes);
                this._addLinks(this.temp_links,this.temp_nodes);
                delete this.temp_nodes;
                delete this.temp_links;
                data['layout_data'] = null;
        
        }
        else{
                this._addNodes(data['nodes']);
                this._addLinks(data['links'],data['nodes']);
        }
        
        this._updateNodeRadii();
        
        this._start(callback,data['layout_data']);
};


D3MSTree.prototype._start= function(callback,layout_data){
       var self = this;
       //add the links
       this.link_elements = this.canvas.selectAll('g.link').data(this.force_links, function(it){
                return it.source.id + "-" + it.target.id;
        });
        var link_enter = this.link_elements.enter().append('g').attr('id', function(it){
                return it.source.id + "-" + it.target.id;
        }).attr('class', "link mst-element");
        
        link_enter.append('line').on("click",function(d){
                self.linkClicked();
        }).on("mouseover",function(d){
                self.linkMouseOver(d);
        
        }).on("mouseout",function(d){
                self.linkMouseOut(d);
        });
        
         
        link_enter.append('text').attr('class', 'distance-label').attr('dy', ".71em").attr('text-anchor', 'middle').attr('font-size', '20px').attr('font-family', 'sans-serif').style('fill', 'gray').style('stroke', 'black').style('stroke-width', '.25px').style('opacity', 1).text(function(it){
                return it.value;
        });
        
        this.node_elements = this.canvas.selectAll('.node').data(this.force_nodes, function(it){
                return it.id;
        });
        
        //nodes
        var new_node_elements = this.node_elements.enter().append('g').attr('class', "node mst-element").attr('id', function(it){
                return it.id;
        });
     
        new_node_elements.append('text').attr('class', 'link-label').attr('text-anchor', 'middle').attr('font-size', '14px').attr('font-family', 'sans-serif').style('fill', 'gray').style('stroke', 'black').style('stroke-width', '.25px').style('opacity', 1).text(function(it){
                return it.id;
        });
       
        new_node_elements.call(this.force_drag).
        on('dblclick', function(it){
            
        }).on('click', function(it){
               
        });
        
        //initially update all
        this.links_to_display = this.link_elements.filter(function(e){return true;});
        this.nodes_to_display = this.node_elements.filter(function(e){return true;});
        this.d3_force_directed_graph.on('tick', function(){		
                if (self.update_graphics){
                        self._updateGraph();
                }		
        });
        
        this.svg.selectAll('.mst-element').sort(function(a, b){
                return d3.descending(a.value, b.value);
        });
        
        if (!layout_data){ 
                this.charge=-400;
                this._setLinkDistance();
                this.gravity=0;
                this.svg.style("display","none");
                this.startForce();
                //for some reason need to give random positions, otherwise leads to stack 
                for (var i in this.force_nodes){
                        var node=this.force_nodes[i];
                      node.x=Math.random()*1000;
                        node.y=Math.random()*1000;
               }
                this.update_graphics=false;
                setTimeout(function(){	
                        self._untangleGraph(true,20,callback);	
                },2000);
        
        }
        else{
                this.setLayout(layout_data);
                this.changeCategory(this.display_category);
                this._updateGraph(true);
                this.stopForce();
                if (callback){
                        callback();
                }
        }
}

D3MSTree.prototype._untangleGraph = function(center,interval,callback){
        var self=this;
       
        interval =interval?interval:100
      
        this.startForce();
        setTimeout(function(){
                self.charge+=5;
                if (self.charge<200){
                        self.gravity=0;
                }
                if (self.charge>=-3){
                        self.charge=-3;
                        self.update_graphics=true;
                        self.startForce();

                        setTimeout(function(){
                                self.svg.style("display","block");
                                self._drawNodes();
                        
                                self.stopForce();
                                self._fixAllNodes();
                                if (center){
                                        self.centerGraph();
                                }
                                 self._setLinkDistance();
             
                        for (var ii in self.force_links){
                                self._correctLinkLengths(self.force_links[ii]);
                        
                        }
                        self._drawLinks();
                        self.changeCategory(self.display_category);
                        self._updateGraph(true);
                        self.startForce();
                        if (callback){
                                callback();
                        }                        
                        },10);
                        return;                     
                }            
                self.startForce();
                
                self._untangleGraph(center,interval,callback);
          
        },interval);
};

D3MSTree.prototype.startForce = function(use_node_force){
                var self=this;
                this.d3_force_directed_graph
                        .gravity(this.gravity)
                        .linkDistance(function(d){
                                return d.link_distance;
                        })
                        .charge(function(d){
                                if (use_node_force){
                                        return d.charge;
                                }
                                return self.charge;			
                        })
                        .linkStrength(10)
                        .size([this.width, this.height])
                        .start();
};

D3MSTree.prototype.stopForce = function(){
        this.d3_force_directed_graph.stop();
};
        



/**
* Updates the tree with the supplied data. Any paramater not supplied will be default
* @param {object} layout _data - An  object containing the following:
* node_positions: a dictionary of node id to an array of x,y co-ordinate e.g.
* {ST234:[23,76],ST455:[65,75]}
* node_links: a dictionary of the following
* max_link_scale : The length in pixels of the longest link
* size_power: The size of nodes representing multiple datapoints are calculated by number of points to the power of this value
* base_node_size: The radius in pixels of a nodes 
* max_link_length: Any links with a value over this will be trimmed to this length 
* scale: The scale factor (1.0 being normal size)
* translate: The offset of the tree an array of x.y co-ordinate e.g. [30.-20]
*/
D3MSTree.prototype.setLayout = function(layout_data){
        if  (layout_data['node_positions']){
                for (var i in this.force_nodes){
                        var node = this.force_nodes[i];
                        var pos = layout_data['node_positions'][node.id];
                        node.x=pos[0];
                        node.px=pos[0];
                        node.y=pos[1];
                        node.py=pos[1];
                }
                this._fixAllNodes();
        }        
        if (layout_data['nodes_links']){
                var data = layout_data['nodes_links'];
                this.max_link_scale=data.max_link_scale?data.max_link_scale:500
                this.size_power=data['size_power']?data['size_power']:0.5;
                this.base_node_size=data.base_node_size;
                this.max_link_length = data.max_link_length?data.max_link_length:10000;
                this.log_link_scale = data['log_link_scale'];
                this.link_font_size = data['link_font_size']?data['link_font_size']:this.link_font_size
                this.distance_scale= d3.scale.linear().domain([0,this.max_link_distance]).range([0,this.max_link_scale]);
                this.show_link_labels =  data['show_link_labels'];
                this.node_font_size = data['node_font_size']?data['node_font_size']:this.node_font_size
                this.show_individual_segments=data['show_individual_segments'];
                if (data['show_node_labels']===undefined){
                       this.show_node_labels=true; 
                }
                else{
                        this.show_node_labels= data['show_node_labels'];
                }
                this.hide_link_length= data["hide_link_length"]?data["hide_link_length"]:this.hide_link_length
                this.custom_colours = data['custom_colours']?data['custom_colours']:this.custom_colours;
                this._updateNodeRadii();
                this._setLinkDistance();
                this.setLinkLength(this.max_link_scale);                                  
        }
        else{              
                this.setLinkLength(this.max_link_scale);
                this.setNodeSize(this.base_node_size);
                          
        }
        var s=layout_data['scale']?layout_data['scale']:1;
        this.setScale(s);
        var translate = layout_data['translate']?layout_data['translate']:[0,0];
        this.setTranslate(translate);
        this.startForce();
        this._drawLinks();
};

/**
* Returns the  data describing the current tree's layout
* @returns {object} layout _data - @see D3MSTree#setLayout
*/
D3MSTree.prototype.getLayout=function(){   
        var node_positions={};
        for (var i in this.force_nodes){
                var node = this.force_nodes[i];
                node_positions[node.id]=[node.x,node.y];
        }
        var nodes_links = { 
                max_link_length:this.max_link_length,
                max_link_scale:this.max_link_scale,
                base_node_size:this.base_node_size,
                size_power:this.size_power,
                link_font_size:this.link_font_size,
                show_link_labels:this.show_link_labels,
                show_node_labels:this.show_node_labels,
                node_font_size:this.node_font_size,
                custom_colours:this.custom_colours,
                hide_link_length:this.hide_link_length,
                show_individual_segments:this.show_individual_segments
        };
        if (this.log_link_scale){
                nodes_links['log_link_scale']= "true";
        }
        return {node_positions:node_positions,
                        nodes_links:nodes_links,
                        scale:this.scale,
                        translate:this.translate,                      
        };	
};

D3MSTree.prototype._drawLinks=function(){
        var self=this;
        this.link_elements.selectAll("line").style('stroke', function(it){
                if (it.value >= self.hide_link_length){
                        return "white";
                }
                else if (it.value > self.max_link_length){
                        return "black";
                }
                return "black";
        }).attr('stroke-dasharray', function(it){
                if (self.max_link_length && it.value > self.max_link_length){
                        return "3,5";
                }
                        return "";
        })
        .attr("stroke-width","3px");
        
        this.link_elements.selectAll(".distance-label").attr("font-size",this.link_font_size)
                        .style('opacity', function(d){
                                       if (!self.show_link_labels || d.value >= self.hide_link_length){
                                                return 0;
                                       }
                                       return 1;
                                }
                        );
}


//
D3MSTree.prototype.changeCategory= function(category){
        if (! category){
                this.display_category=null;
                this.category_colours['missing']=this.default_colour;
        
        }
        else{
                this._changeCategory(category);
        }
        
        
        var self = this;
        var nodes_existing = this.node_elements.filter(function(d){return !d.hypothetical})
                                                .selectAll('.node-paths').data(function(it){
                                                        return self._getPieData(it, category);
                                                        
                                                });
        nodes_existing.enter().append('path').classed("node-paths",true);
        nodes_existing.exit().remove();
        
       this.node_elements.selectAll('.node-paths')
        .on("mouseover",function(d){
                self.segmentMouseOver(d);
        }).on("mouseout",function(d){
                self.segmentMouseOut(d);
        })
        .style("stroke","black");      
        this._drawNodes();
        this._setNodeText();
}


D3MSTree.prototype._drawNodes=function(){
        var self = this;
        this.node_elements.selectAll('.node-paths').attr('d', this.arc).attr('fill', function(it){
                 return self.category_colours[it.data.type];
        });
        this.node_elements.selectAll('.halo')
                .attr("d",function(d){                  
                       var r  = self.node_radii[d.id];
                        var arc = d3.svg.arc().innerRadius(r).outerRadius(r+d.halo_thickness).startAngle(0).endAngle(2 * Math.PI);
                        return arc();
                })
                .attr("fill",function(d){
                        return d.halo_colour;
                });
};

D3MSTree.prototype.setNodeText = function(value){
    
        this.node_text_value=value;
        this._setNodeText();
}

D3MSTree.prototype._setNodeText = function(){
        var self=this;
        var field =this.node_text_value;
        this.node_elements.selectAll('text').remove();
        if (! this.show_node_labels){
                return;
        }
        node_text = this.node_elements.append('text').attr('class', 'node-group-number').
        attr('dy', ".71em").attr('text-anchor', 'middle').attr('font-size', this.node_font_size).
        attr('font-family', 'sans-serif').attr('transform', function(it){
                return "translate(0," + -self.node_font_size / 3 + ")";
        }).text(function(it){                
                if (field && field !== "node_id"){
                        var id_list=self.grouped_nodes[it.id];
                        if (id_list){                               
                                var display = self.metadata[id_list[0]][field];
                                return display?display:"ND";
                        }
                        else{
                                return "ND";
                        }                    
                }
                return  it.id
        });
};





D3MSTree.prototype._calculateArc=function(){
        var self=this;
        return d3.svg.arc().outerRadius(function(it){
               return self.node_radii[it.data.idx];
        }).innerRadius(0);

}


D3MSTree.prototype._getPieData = function(d, category){
        var results =[];
        if (category){
                var strains = this.grouped_nodes[d.id];
                var type_counts={}
                for (i in strains) {
                        strain = strains[i];
                        strain_metadata = this.metadata[strain];
                        if (strain_metadata == null) {
                                console.log('genome', strain, strain_metadata);
                        } 
                        else {
                                var value = strain_metadata[category];                  
                                if (!value){
                                        var missing = type_counts['missing']
                                        if (!missing){
                                                type_counts['missing']=1;                                
                                        }
                                        else{
                                                type_counts['missing']++;   
                                        }
                                }
                                else{
                                        var count = type_counts[value];
                                        if (!count){
                                                type_counts[value]=1;
                                        }
                                        else{
                                                type_counts[value]++;
                                        } 
                                }
                        }
                }
                for (var type in type_counts){
                        var count = type_counts[type];
                        if (this.show_individual_segments){
                                for (var n=0;n<count;n++){
                                                results.push({
                                                value: 1,
                                                type: type,
                                                idx: d.id
                                        });
                                }
                        }
                        else{
                                results.push({
                                        value: count,
                                        type: type,
                                        idx: d.id
                                });        
                        } 
                }                        
        }
        else{
                results=[{
                        value:1,
                        type:'missing',
                        idx:d.id               
                }];      
        }                
        return this.pie(results);                  
};

//change position
D3MSTree.prototype._updateGraph = function(all){
        var links  = this.links_to_display;
        var nodes = this.nodes_to_display;
        if (all){
                links = this.link_elements;
                nodes = this.node_elements;
        
        }
        links.selectAll('text').attr('x', function(it){
                
                return (it.source.x + it.target.x) / 2.0;
                
        }).attr('y', function(it){
                return (it.source.y + it.target.y) / 2.0;
        });
        
        links.selectAll('line').attr('x1', function(it){
                return it.source.x;
        }).attr('y1', function(it){
                return it.source.y;
        }).attr('x2', function(it){
                return it.target.x;
        }).attr('y2', function(it){
                return it.target.y;
        });
        
        nodes.attr('transform', function(it){
                return "translate(" + it.x + "," + it.y + ")";
        });
}

D3MSTree.prototype._updateNodeRadii=function(){
        for (var i in this.force_nodes){
                node = this.force_nodes[i];
                var arr = this.grouped_nodes[node.id]
                var len = arr?arr.length:1
                var  radius =  Math.pow(len, this.size_power)*this.base_node_size;
                this.node_radii[node.id]=radius;
        }
    
}

D3MSTree.prototype._saveNodeRadii=function(){
        for (var i in this.force_nodes){
                node = this.force_nodes[i];
                var arr = this.grouped_nodes[node.id]
                var len = arr?arr.length:1
                var  radius =  Math.pow(len, this.size_power)*this.base_node_size;
                this.previous_node_radii[node.id]=radius;
        }
}

D3MSTree.prototype._addNodes=function(ids){                   
        if (ids.length < 4){
                this.gravity=0.02;
        }
        
        for ( var i = 0;i < ids.length; i++) {
                id = ids[i];
                var name =id;
                if (id === "hypothetical_node"){
                        name = "hypo_node_"+i;
                        ids[i]=name;
                }
                var node = {
                      id:name,
                      value:-1,
                      selected:false
                };
                 if (id === "hypothetical_node"){
                        node['hypothetical']=true;
                 }
                this.force_nodes.push(node);    
        }
}

D3MSTree.prototype._findNode=function(id){
       for (var i in this.force_nodes){
              n=this.force_nodes[i];
              if (n.id === id){
                     return n
              }     
       }
}



D3MSTree.prototype._addLinks=function(links,ids){
       new_links=[];
       for (var i in links){
                link = links[i];
                new_links.push({
                       value:link['distance'],
                       source:ids[link['source']],
                       target:ids[link['target']]      
                });
       }
       this.max_link_distance=0;
       for (var i=0;i< new_links.length;i++) {
                x = new_links[i];
                if (x.value > this.max_link_distance){
                       this.max_link_distance=x.value;
                }
                var target_node = this._findNode(x.target);
                var source_node = this._findNode(x.source);
                var link = {
                       source: source_node,
                       target: target_node,
                       value: x.value
                };
                this.force_links.push(link)
        }
          
        this.distance_scale= d3.scale.linear().domain([0,this.max_link_distance]).range([0,this.max_link_scale]);
        //add the children/parents
        for (var i in this.force_links){
                var link = this.force_links[i];
                
                if (!link.source['children']){
                        link.source['children']=[]
                }
                link.source.children.push(link.target);
                link.target.parent = link.source;            
        }      
}

D3MSTree.prototype._getLink=function(target_node){
        for (var index in this.force_links){
                if (this.force_links[index].target.id === target_node.id){
                        return this.force_links[index];
                }		
        }	
}

/** Internally sets the actual length of the link to be acurate to the supplied value
* If not in fixed mode than this may not be strictly adhered
*/
 D3MSTree.prototype._setLinkDistance=function(){
        var self= this;
        this.link_elements.each(function(d){			
                var length =  self.node_radii[d.source.id] + self.node_radii[d.target.id];
                var line_len = d.value;
                if (self.max_link_length){
                        if (line_len>self.max_link_length){
                                line_len=self.max_link_length;
                        }
                }
                if (self.log_link_scale){
                        length=Math.pow(self.distance_scale(line_len),0.8)+length;
                }
                else{
                        length =  self.distance_scale(line_len)+length;
                }
                d.link_distance=length;		
        });
 };
 
 D3MSTree.prototype.refreshGraph = function(callback){
        this.charge=-400;	
        var self=this;
        this.svg.style("display","none");
        this.startForce();		
        setTimeout(function(){			
                self._untangleGraph(false,1,callback);			
        },2000);
}

D3MSTree.prototype.centerGraph = function(){
        var firstNode = this.force_nodes[0];                      
        var maxX=firstNode.x;
        var minX=firstNode.x;
        var maxY = firstNode.y;
        var minY = firstNode.y;
        var nodes = this.force_nodes;
        for (var n=1;n<nodes.length;n++){
                var node = nodes[n];
                if (node.x>maxX){maxX=node.x;}
                if (node.x<minX){minX=node.x;}
                if (node.y>maxY){maxY=node.y;}
                if (node.y<minY){minY=node.y;}
                                
        }   
        for (var n=0;n<nodes.length;n++){
                var node = nodes[n];
                node.x-=minX;
                node.px =node.x;
                node.y -=minY;
                node.py=node.y
                                
        }
        var wdiff = maxX-minX;
        var hdiff = maxY-minY;
        var scale=1;
        if (wdiff>hdiff){
                scale = (this.width/(maxX-minX));
        }
        else{
                scale = (this.height/(maxY-minY));
        }
        this.setScale(scale);
}
 
 
//public methods
D3MSTree.prototype.setLogLinkScale=function(log){
        this.log_link_scale = log;
        this._setLinkDistance();
        for (var ii in this.force_links){
                this._correctLinkLengths(this.force_links[ii]);		
        }
        this._updateGraph(true);      
}

D3MSTree.prototype.clearSelection= function(){ 
        for (var i in this.force_nodes) {
                var node = this.force_nodes[i];
                node.selected = false;
                delete node.halo_colour;
                delete node.halo_thickness
        }
        this.node_elements.classed('selected', false);
        this.node_elements.selectAll(".halo").remove();
        
};


D3MSTree.prototype.setMaxLinkLength=function(amount){
        var self=this;
        amount = parseInt(amount);
        if (isNaN(amount) || amount <=0){
                amount = null;
        }
        this.max_link_length=amount;
        this.distance_scale= d3.scale.linear().domain([0,this.max_link_distance]).range([0,this.max_link_scale]).clamp(true);
        this._setLinkDistance();
        this._drawLinks();
                
        for (var ii in this.force_links){
                this._correctLinkLengths(this.force_links[ii]);		
        }
        this._updateGraph(true);
};

/** Sets the length of the links
* @param {integer} max_length - This  specifies the maximum length of the links in pixels
* The longest link will be this length and the rest scaled between this value and 1
* If in fixed mode, node lengths will be exact, otherwise the force algorithm may not be able to acheieve the 
* correct length
*/
D3MSTree.prototype.setLinkLength=function(max_length){		
        this.max_link_scale=max_length;
        this.distance_scale= d3.scale.linear().domain([0,this.max_link_distance]).range([0,max_length]);
        this._setLinkDistance();
        if (this.fixed_mode){
                this.stopForce();        
                for (var ii in this.force_links){
                        this._correctLinkLengths(this.force_links[ii]);
                                
                }
                this._updateGraph(true);
        }
        this.startForce();		
};
/** Sets the font size of the links
* @param {integer} The font size (in pixels)
*/
D3MSTree.prototype.setLinkFontSize = function(size){
        this.link_font_size=size;
        this.link_elements.selectAll('.distance-label').transition()
                                        .attr('font-size',this.link_font_size+"px");
};

/** 
resets the link lenghts to accurately reflect the supplied value
*/
D3MSTree.prototype.resetLinkLengths=function(){
        this._setLinkDistance();
        this.stopForce();        
                for (var ii in this.force_links){
                        this._correctLinkLengths(this.force_links[ii]);                              
                }
                this._updateGraph(true);
        this.startForce();
        
};

D3MSTree.prototype.showLinkLabels = function(show){
        this.show_link_labels = show;       
        this.link_elements.selectAll('.distance-label').transition().style('opacity', show ? 1 : 0);
};



D3MSTree.prototype.setNodeSize = function(node_size){
        this._saveNodeRadii();
        this.base_node_size=node_size;	 
        this._updateNodeRadii();
        this._nodeSizeAltered();
       
};

D3MSTree.prototype.setRelativeNodeSize = function(factor){
        this._saveNodeRadii();
        this.size_power=factor;
        this._updateNodeRadii();
        this._nodeSizeAltered();
      
};

D3MSTree.prototype._nodeSizeAltered= function(){
        var self = this;
        for (var i in this.force_links){
                var link =this.force_links[i];
                var prev_length =  self.previous_node_radii[link.source.id] + self.previous_node_radii[link.target.id];
                var current_length = self.node_radii[link.source.id] + self.node_radii[link.target.id];
                link.link_distance = link.link_distance -prev_length+ current_length
        
        }
         for (var ii in this.force_links){
                       this._correctLinkLengths(this.force_links[ii]);		
        }
        this._drawNodes()
        this._updateGraph(true);
        
        
};




D3MSTree.prototype.getSelectedIDs=function(){
        var selected = [];
        for (i = 0; i<this.force_nodes.length;i++) {
                var node = this.force_nodes[i];
                if (node.selected){
                        var group = this.grouped_nodes[node.id];
                        selected=selected.concat(group)  
                }
        }
        ret_list=[]
        for (var i in selected){
                ret_list.push(parseInt(selected[i]));
        
        }
        return  ret_list;
}




D3MSTree.prototype.showIndividualSegments= function(show){
        this.show_individual_segments=show;
        this.changeCategory(this.display_category);
        this._drawNodes();

};

D3MSTree.prototype.setNodeFontSize = function(size){
        this.node_font_size=size;
        this._setNodeText();
};


D3MSTree.prototype.setNodeText = function(value){
        this.node_text_value = value;
        this._setNodeText();
};

D3MSTree.prototype.showNodeLabels = function(show){
        this.show_node_labels= show;
        this._setNodeText();
};

D3MSTree.prototype.alterCharge=function(amount){
        this.charge = amount*-1;
        this.startForce();
};


D3MSTree.prototype._correctLinkLengths= function(it){
        //this.stop_force();
        var source  =it.source;
        var target =it.target;
        var x_dif = target.x-source.x;
        var y_dif = target.y - source.y;
        var actual_length = Math.sqrt((x_dif*x_dif)+(y_dif*y_dif));
        var required_length =  it.link_distance;
        var factor = required_length/actual_length;
        old_x=target.x;
        old_y=target.y;	
        target.x = source.x+(x_dif*factor);
        target.y = source.y+(y_dif*factor);	
        target.px= target.x;
        target.py =target.y
        this._alterChildrenPosition(target,target.x-old_x,target.y-old_y);	
}


D3MSTree.prototype._addHalos= function (filter_function,thickness,colour){
        var self = this;
        var arc1 = d3.svg.arc().innerRadius(30).outerRadius(40).startAngle(0).endAngle(2 * Math.PI);
        var ret1 = arc1();
        
        var halos = self.node_elements.filter(filter_function)
                .append("path")
                .attr("class","halo")
                .attr("d",function(d){
                        d.halo_thickness = thickness;
                        d.halo_colour=colour;
                        var r  = self.node_radii[d.id];
                        var arc = d3.svg.arc().innerRadius(r).outerRadius(r+thickness).startAngle(0).endAngle(2 * Math.PI);
                        return arc();
                })
                .attr("fill",colour);
        
         self.node_elements.sort(function(a,b){
                if (a.halo_thickness){
                        return 1;
                }
                else{
                        if (b.halo_thickness){
                                return -1;
                        }
                        else{
                                return 0;
                        }
                }
         
         })
  
}



D3MSTree.prototype._getActualLinkLength= function(link){
        var source  = link.source;
        var target = link.target;
        var x_dif = target.x-source.x;
        var y_dif = target.y - source.y;
        return Math.sqrt((x_dif*x_dif)+(y_dif*y_dif));
}


D3MSTree.prototype._tagAllChildren=function(node,state){
        if (!node.children){
                return;
        }
        for (var x in node.children){
                child = node.children[x];
                child.tagged=state;
                this._tagAllChildren(child,state);
        }
}

//will only update the nodes which have the property specified
D3MSTree.prototype._updateNodesToDisplay = function(tag){
        if (!tag){
                tag= 'fixed';
        }
        this.links_to_display = this.link_elements.filter(function(e){
                return (e.target[tag] || e.source[tag]);
        });
        this.nodes_to_display = this.node_elements.filter(function(e){
                if (e[tag]){
                        return true;
                }
                return false;
        });

}

D3MSTree.prototype.unfixSelectedNodes= function(all){
        for (i = 0; i<this.force_nodes.length;i++) {
        var node = this.force_nodes[i];
                if (node.selected || all){
                        node.fixed=false;
                        node.selected=false;
                        node.update=true;
                }		
        }
        //get rid of selection
        if (! all){
                this._drawNodes();
        
        }
        this._updateNodesToDisplay("update")
        this.fixed_mode=false;
        this.startForce(true);
}

D3MSTree.prototype.fixAllNodes=function(){
        this.stopForce();
        for (var index in this.force_nodes){
                var node = this.force_nodes[index];   
                        node.fixed=true;
                        node.update=false;			
        }
        for (var ii in this.force_links){
                var link = this.force_links[ii];
                link.link_distance= this._getActualLinkLength(link);
                                
        }
        this.fixed_mode=true;
        this._updateGraph(true);	
        //this.change_nodes_to_update();
        this.startForce();
}

 
D3MSTree.prototype._fixAllNodes = function(){            
        for (var i in this.force_nodes) {
                node = this.force_nodes[i];
                node.fixed = true;
                node.charge=-30;
        }
        this.links_to_display = this.link_elements.filter(function(e){return false;});
        this.nodes_to_display = this.node_elements.filter(function(e){return false;});
        this.node_elements.classed('fixed', true);
};


D3MSTree.prototype._alterChildrenPosition =function(node,x_diff,y_diff){
                if (!node.children){
                        return;
                }
                for (var x in node.children){
                        child = node.children[x];
                        
                        child.x+=x_diff;
                        child.y+=y_diff;
                        child.px=child.x;
                        child.py=child.y
                        this._alterChildrenPosition(child,x_diff,y_diff);
                }
        
}

D3MSTree.prototype._rotateChildren =function (node,angle_change,center){
        if (!node.children){
                return;
        }
        for (var x in node.children){
                        child = node.children[x];
                        var x1 = child.x- center.x;
                        var y1 = child.y- center.y;
                        var child_radius = Math.sqrt((x1*x1)+(y1*y1));
                        var child_angle = Math.atan2(y1,x1);
                        var new_angle = child_angle+angle_change;
                        x_offset = Math.cos(new_angle)*child_radius;
                        y_offset  = Math.sin(new_angle)*child_radius;			
                        child.x=center.x+x_offset;
                        child.y=center.y+y_offset;
                        child.px=child.x;
                        child.py=child.y
                        this._rotateChildren(child,angle_change,center);
        }

}

D3MSTree.prototype.setHideLinkLength=function(max_length){
        this.hide_link_length=max_length;
        this._drawLinks();
};


D3MSTree.prototype._unfixAllChildNodes=function(node,count){
        if (!node.children){
                return;
        }
        if (count===4){
                return;		
        }
        if (count){
                count++;
        }
        else{
                for (var x in node.children){
                        child = node.children[x];
                        child.fixed= false;
                        child.charge=0;
                        this.unfixAllChildNodes(child,count);
                        
                }
        }

};	
   

D3MSTree.prototype.highlightIDs = function (IDs){
        this.clearSelection();
       var self = this;
       this._addHalos(function(d){
                        var group = self.grouped_nodes[d.id];
                        for (var i=0;i<IDs.length;i++){
                                if (group.indexOf(IDs[i]) !== -1){
                                        return true;
                                }
                        }
                        return false;

        },22,"yellow");
      
}


//Dragging Functions
D3MSTree.prototype._dragStarted= function(it){
       if (! this.fixed_mode){
              return;
       }
       this.stopForce();
       if (!it.parent){
              this.drag_orig_xy=[it.x,it.y];
              return;
       }
                
       it.fixed=true;
       it.tagged=true;
       //tag all children and highlight        
       this._tagAllChildren(it,true);         
       this.node_elements.filter(function(node){
              return node.tagged;
       }).selectAll(".node-paths").style("stroke","red").attr("stroke-width","3px");
       this._updateNodesToDisplay("tagged");
       
       this.drag_link =this._getLink(it);
       var x_dif = it.x-it.parent.x
       var y_dif = it.y-it.parent.y;
       this.drag_source=it.parent;
       this.initial_drag_angle= Math.atan2(y_dif,x_dif);
       this.drag_radius = Math.sqrt((x_dif*x_dif)+(y_dif*y_dif));               
};

D3MSTree.prototype._dragging= function(it){
       
        if (! this.fixed_mode){
              return;
       }
       if (!it.parent){
              it.x=this.drag_orig_xy[0];
              it.y =this.drag_orig_xy[1];
              it.px=it.x;
              it.py=it.y;
              return;
       }
       it.px += d3.event.dx;
       it.py += d3.event.dy;
       it.x += d3.event.dx;
       it.y += d3.event.dy;
       var source  =this.drag_source;
                
       var target =it;
       var x_dif = target.x-source.x;
       var y_dif = target.y - source.y;
       var actual_length = Math.sqrt((x_dif*x_dif)+(y_dif*y_dif));
       var required_length =  this.drag_link.link_distance;	
       var factor = required_length/actual_length;
       old_x=target.x;
       old_y=target.y;

       target.x = source.x+(x_dif*factor);
       target.y = source.y+(y_dif*factor);

       target.px= target.x;
       target.py =target.y;
       
       var final_angle = Math.atan2(it.y-source.y,it.x-source.x);
       var angle_change = final_angle- this.initial_drag_angle; 
       this._rotateChildren(it,angle_change,this.drag_source);			
       this.initial_drag_angle= Math.atan2(y_dif,x_dif);
       this._updateGraph();
};

D3MSTree.prototype._dragEnded=function(it){
       var self = this;
       if (! this.fixed_mode){
              return;
       }
       if (!it.parent){	       
              return;
       }
       var source  = this.drag_source;
       
       var target = it;
       var x_dif = target.x-source.x;
       var y_dif = target.y - source.y;
       var actual_length = Math.sqrt((x_dif*x_dif)+(y_dif*y_dif));
       
       var required_length =  this.drag_radius	
       var factor = required_length/actual_length;
       target.x = source.x+(x_dif*factor);
       target.y = source.y+(y_dif*factor);
       target.px= target.x;
       target.py =target.y;
       var final_angle = Math.atan2(it.y-source.y,it.x-source.x);
       var angle_change = final_angle- this.initial_drag_angle;
       this.node_elements.filter(function(node){
               return node.tagged;
       }).selectAll(".node-paths").style("stroke","black").attr("stroke-width","1px");
       it.fixed=true;
       it.tagged=false;
       this._rotateChildren(it,angle_change,source);
       this._updateGraph();
       this._tagAllChildren(it,false);
}


D3MSTree.prototype.createLinksFromNewick=function(node,parent_id){
        if (node.name == "hypothetical_node"){
                   this.temp_nodes.push(node.name)
        }
        else{
                this.temp_nodes.push("ST"+node.name);
        }
        var node_id = this.temp_nodes.length-1;
        if (node_id !=0){
                this.temp_links.push({source:parent_id,target:node_id,distance:node.length});
        }
        if (node.children){
                for (var index in node.children){
                        var child = node.children[index];
                        this.createLinksFromNewick(child,node_id);
                }
        }
}


//brush functions
D3MSTree.prototype.brushEnded=function(extent){
        this.node_elements.filter(function(d){
                var selected =(extent[0][0] <= d.x && d.x < extent[1][0] && extent[0][1] <= d.y && d.y < extent[1][1]);
                if (selected){
                        d.selected=true;
                }
                return selected;
        }).attr("class","selected");
     
       this._addHalos(function(d){return d.selected},5,"red");
}