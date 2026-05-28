import React from 'react';

export default function VariableWatch({ variables }) {
  // Ignore internal functions or helpers
  const userVars = Object.keys(variables).filter(k => 
    k !== 'range' && 
    k !== 'print' && 
    !k.startsWith('_list_comp_res') && 
    !k.startsWith('_ternary_res')
  );

  return (
    <div className="watch-card">
      <div className="panel-header">
        <div className="panel-title-group">
          <i className="fa-solid fa-binoculars icon-pink"></i>
          <h3>Variable Scope Monitor</h3>
        </div>
      </div>
      <div id="variables-watch" className="watch-body">
        {userVars.length === 0 ? (
          <div className="var-row placeholder">
            No variables defined yet in running context.
          </div>
        ) : (
          userVars.map(vName => {
            const vVal = variables[vName];
            const displayVal = Array.isArray(vVal) 
              ? `[${vVal.map(x => (typeof x === 'string' ? `"${x}"` : String(x))).join(', ')}]` 
              : String(vVal);
            return (
              <div key={vName} className="var-row">
                <span className="var-name">{vName}</span>
                <span className="var-val">{displayVal}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
